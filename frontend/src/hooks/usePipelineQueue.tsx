import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getActivePipelineJobs,
  cancelPipelineJob as cancelPipelineJobApi,
  isLoggedIn,
  type ActivePipelineJob,
} from "../api";

const POLL_INTERVAL_MS = 4000;
const ACTIVE_STATUSES = new Set(["pending", "running", "awaiting_approval"]);
const PIPELINE_TRAY_MINIMIZED_KEY = "pipelineTrayMinimized";

export interface PipelineQueueState {
  jobs: ActivePipelineJob[];
  inFlightCount: number;
  cap: number;
  hasAwaitingApproval: boolean;
  runningCount: number;
  pendingCount: number;
  loaded: boolean;
  isTrayMinimized: boolean;
  refresh: () => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => void;
  addOptimistic: (job: ActivePipelineJob) => void;
  removeOptimistic: (jobId: string) => void;
  minimizeTray: () => void;
  expandTray: () => void;
}

const PipelineQueueContext = createContext<PipelineQueueState | null>(null);

export function PipelineQueueProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [jobs, setJobs] = useState<ActivePipelineJob[]>([]);
  const [inFlightCount, setInFlightCount] = useState<number>(0);
  const [cap, setCap] = useState<number>(3);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [optimistic, setOptimistic] = useState<ActivePipelineJob[]>([]);
  const [isTrayMinimized, setIsTrayMinimized] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PIPELINE_TRAY_MINIMIZED_KEY) === "1";
  });

  const inFlightRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!isLoggedIn()) return;
    inFlightRef.current = true;
    try {
      const res = await getActivePipelineJobs();
      if (!mountedRef.current) return;
      setJobs(res.jobs);
      setInFlightCount(res.inFlightCount);
      setCap(res.cap);
      setLoaded(true);
      setDismissedIds((prev) => {
        if (prev.size === 0) return prev;
        const nextIds = new Set<string>();
        const visible = new Set(res.jobs.map((j) => j.id));
        for (const id of prev) {
          if (visible.has(id)) nextIds.add(id);
        }
        return nextIds.size === prev.size ? prev : nextIds;
      });
      setOptimistic((prev) => {
        if (prev.length === 0) return prev;
        const visible = new Set(res.jobs.map((j) => j.id));
        return prev.filter((o) => !visible.has(o.id));
      });
    } catch (err) {
      console.warn("[pipeline-queue] poll failed:", err);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PIPELINE_TRAY_MINIMIZED_KEY,
      isTrayMinimized ? "1" : "0",
    );
  }, [isTrayMinimized]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (document.hidden) {
        timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      void fetchOnce().finally(() => {
        if (cancelled) return;
        timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      });
    };

    void fetchOnce();
    timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, fetchOnce]);

  const cancel = useCallback(
    async (jobId: string) => {
      try {
        await cancelPipelineJobApi(jobId);
      } finally {
        await fetchOnce();
      }
    },
    [fetchOnce],
  );

  const dismiss = useCallback((jobId: string) => {
    setDismissedIds((prev) => {
      if (prev.has(jobId)) return prev;
      const next = new Set(prev);
      next.add(jobId);
      return next;
    });
  }, []);

  const addOptimistic = useCallback((job: ActivePipelineJob) => {
    setOptimistic((prev) => {
      if (prev.some((j) => j.id === job.id)) return prev;
      return [job, ...prev];
    });
  }, []);

  const removeOptimistic = useCallback((jobId: string) => {
    setOptimistic((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const minimizeTray = useCallback(() => {
    setIsTrayMinimized(true);
  }, []);

  const expandTray = useCallback(() => {
    setIsTrayMinimized(false);
  }, []);

  const visibleJobs = useMemo(() => {
    const seen = new Set<string>();
    const combined: ActivePipelineJob[] = [];
    for (const j of optimistic) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      combined.push(j);
    }
    for (const j of jobs) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      combined.push(j);
    }
    return combined.filter((j) => !dismissedIds.has(j.id));
  }, [jobs, optimistic, dismissedIds]);

  const hasAwaitingApproval = useMemo(
    () => visibleJobs.some((j) => j.status === "awaiting_approval"),
    [visibleJobs],
  );

  const runningCount = useMemo(
    () => visibleJobs.filter((j) => j.status === "running").length,
    [visibleJobs],
  );

  const pendingCount = useMemo(
    () => visibleJobs.filter((j) => j.status === "pending").length,
    [visibleJobs],
  );

  const effectiveInFlight = useMemo(() => {
    const serverCount = inFlightCount;
    const optimisticInFlight = optimistic.filter(
      (j) =>
        !jobs.some((server) => server.id === j.id) &&
        ACTIVE_STATUSES.has(j.status),
    ).length;
    return serverCount + optimisticInFlight;
  }, [inFlightCount, optimistic, jobs]);

  const value = useMemo<PipelineQueueState>(
    () => ({
      jobs: visibleJobs,
      inFlightCount: effectiveInFlight,
      cap,
      hasAwaitingApproval,
      runningCount,
      pendingCount,
      loaded,
      isTrayMinimized,
      refresh: fetchOnce,
      cancel,
      dismiss,
      addOptimistic,
      removeOptimistic,
      minimizeTray,
      expandTray,
    }),
    [
      visibleJobs,
      effectiveInFlight,
      cap,
      hasAwaitingApproval,
      runningCount,
      pendingCount,
      loaded,
      isTrayMinimized,
      fetchOnce,
      cancel,
      dismiss,
      addOptimistic,
      removeOptimistic,
      minimizeTray,
      expandTray,
    ],
  );

  return (
    <PipelineQueueContext.Provider value={value}>
      {children}
    </PipelineQueueContext.Provider>
  );
}

export function usePipelineQueue(): PipelineQueueState {
  const ctx = useContext(PipelineQueueContext);
  if (!ctx) {
    throw new Error(
      "usePipelineQueue must be used within <PipelineQueueProvider>",
    );
  }
  return ctx;
}

/** Optional variant for consumers that may render outside the provider. */
export function useOptionalPipelineQueue(): PipelineQueueState | null {
  return useContext(PipelineQueueContext);
}
