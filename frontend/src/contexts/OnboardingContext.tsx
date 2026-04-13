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
import { useLocation } from "react-router-dom";
import {
  getOnboardingStatus,
  type OnboardingStatusResponse,
} from "../api";

const TASKS: {
  id: string;
  label: string;
  description: string;
  href: string;
  optional?: boolean;
}[] = [
  {
    id: "resume_uploaded",
    label: "Upload your resume",
    description: "We'll extract your profile automatically",
    href: "/settings/resume",
  },
  {
    id: "profile_complete",
    label: "Complete your profile",
    description: "Name, university, contact info",
    href: "/settings/profile",
  },
  {
    id: "transcript_uploaded",
    label: "Upload your transcript",
    description: "For jobs that require it",
    href: "/settings/transcript",
  },
  {
    id: "handshake_connected",
    label: "Connect Handshake",
    description: "Link your university account",
    href: "/settings/handshake",
  },
];

export type OnboardingContextValue = {
  tasks: (typeof TASKS[number] & { done: boolean })[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  progressPercent: number;
  nextTask: (typeof TASKS)[number] | null;
  markComplete: (taskId: keyof OnboardingStatusResponse) => void;
  loading: boolean;
  completion: OnboardingStatusResponse;
  /** Re-fetch status from API (e.g. after upload/save on same route). */
  refetch: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [completion, setCompletion] = useState<OnboardingStatusResponse>({
    resume_uploaded: false,
    profile_complete: false,
    handshake_connected: false,
    transcript_uploaded: false,
  });
  const [loading, setLoading] = useState(enabled);
  const location = useLocation();
  const firstLoadForSession = useRef(true);

  const load = useCallback(
    async (opts: { showSpinner: boolean }) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (opts.showSpinner) setLoading(true);
      try {
        const res = await getOnboardingStatus();
        setCompletion({
          resume_uploaded: Boolean(res.resume_uploaded),
          profile_complete: Boolean(res.profile_complete),
          handshake_connected: Boolean(res.handshake_connected),
          transcript_uploaded: Boolean(res.transcript_uploaded),
        });
      } catch (err) {
        console.error("Failed to fetch onboarding status", err);
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      firstLoadForSession.current = true;
      return;
    }
    const showSpinner = firstLoadForSession.current;
    firstLoadForSession.current = false;
    void load({ showSpinner });
  }, [enabled, location.pathname, load]);

  const refetch = useCallback(async () => {
    await load({ showSpinner: false });
  }, [load]);

  const { completedCount, totalCount, isComplete, progressPercent, nextTask } =
    useMemo(() => {
      const completedCount = Object.values(completion).filter(Boolean).length;
      const totalCount = TASKS.length;
      const isComplete = completedCount === totalCount;
      const progressPercent = Math.round((completedCount / totalCount) * 100);
      const nextTask =
        TASKS.find((t) => !completion[t.id as keyof typeof completion]) ??
        null;
      return {
        completedCount,
        totalCount,
        isComplete,
        progressPercent,
        nextTask,
      };
    }, [completion]);

  const markComplete = useCallback(
    (taskId: keyof OnboardingStatusResponse) => {
      setCompletion((prev) => ({ ...prev, [taskId]: true }));
    },
    [],
  );

  const value = useMemo(
    (): OnboardingContextValue => ({
      tasks: TASKS.map((t) => ({
        ...t,
        done: completion[t.id as keyof typeof completion],
      })),
      completedCount,
      totalCount,
      isComplete,
      progressPercent,
      nextTask,
      markComplete,
      loading,
      completion,
      refetch,
    }),
    [
      completion,
      completedCount,
      totalCount,
      isComplete,
      progressPercent,
      nextTask,
      markComplete,
      loading,
      refetch,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
