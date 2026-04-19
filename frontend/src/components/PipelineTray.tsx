import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Clock,
  Loader2,
  X,
} from "lucide-react";
import type { ActivePipelineJob } from "../api";
import { usePipelineQueue } from "../hooks/usePipelineQueue";

export type PipelineTrayVariant = "floating" | "inline";

function statusLabel(job: ActivePipelineJob, position: number | null): string {
  switch (job.status) {
    case "pending":
      return position != null && position > 0
        ? `Queued · ${position} ahead`
        : "Queued";
    case "running":
      return job.phase ?? "Working…";
    case "awaiting_approval":
      return "Ready to review";
    case "done":
      return "Submitted";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return String(job.status);
  }
}

function StatusIcon({ status }: { status: ActivePipelineJob["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4 text-gray-400" aria-hidden />;
    case "running":
      return (
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" aria-hidden />
      );
    case "awaiting_approval":
      return <Clock className="w-4 h-4 text-blue-600" aria-hidden />;
    case "done":
      return <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden />;
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-600" aria-hidden />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" aria-hidden />;
  }
}

function detailHref(job: ActivePipelineJob): string | null {
  if (!job.site || !job.jobUrl) return null;
  const match =
    job.jobUrl.match(/\/jobs\/(\d+)/) || job.jobUrl.match(/job-search\/(\d+)/);
  if (!match) return null;
  return `/discover/job/${encodeURIComponent(`${job.site}:${match[1]}`)}`;
}

interface PipelineTrayProps {
  /** `floating`: fixed bottom-right elsewhere in the app. `inline`: section under Discover hero. */
  variant?: PipelineTrayVariant;
}

export function PipelineTray({ variant = "floating" }: PipelineTrayProps) {
  const navigate = useNavigate();
  const {
    jobs,
    cap,
    inFlightCount,
    cancel,
    dismiss,
    hasAwaitingApproval,
    isTrayMinimized,
    minimizeTray,
  } = usePipelineQueue();

  const pendingAhead = useMemo(() => {
    const pendings = jobs.filter((j) => j.status === "pending");
    const positions = new Map<string, number>();
    pendings
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .forEach((j, idx) => positions.set(j.id, idx));
    return positions;
  }, [jobs]);

  const isFloating = variant === "floating";
  const hiddenByMinimize = isFloating && isTrayMinimized;
  const showInline = !isFloating && jobs.length > 0;
  const showFloating = isFloating && jobs.length > 0 && !hiddenByMinimize;

  if (!showInline && !showFloating) return null;

  const outerClassName = isFloating
    ? "fixed right-4 z-40 w-[min(22rem,calc(100vw-2rem))] bottom-20 md:bottom-4"
    : "w-full max-w-xl mx-auto mt-6";

  const panelClassName = isFloating
    ? "bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
    : "bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden";

  return (
    <div className={outerClassName} role="region" aria-label="Pipeline queue">
      <div className={panelClassName}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
            <Clock className="w-4 h-4 text-blue-600" aria-hidden />
            <span>Queue</span>
            <span className="text-[11px] font-normal text-gray-500">
              {inFlightCount}/{cap}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasAwaitingApproval && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                Review ready
              </span>
            )}
            {isFloating && (
              <button
                type="button"
                onClick={minimizeTray}
                className="inline-flex items-center justify-center rounded-md border-0 bg-transparent p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer transition-colors"
                aria-label="Minimize queue tray"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
          {jobs.map((job) => {
            const pos = pendingAhead.get(job.id) ?? null;
            const href = detailHref(job);
            const isTerminal =
              job.status === "done" ||
              job.status === "failed" ||
              job.status === "cancelled";
            return (
              <li key={job.id} className="px-4 py-3 flex items-start gap-3">
                <div className="pt-0.5">
                  <StatusIcon status={job.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {job.jobTitle ?? job.jobUrl ?? "Job"}
                    </p>
                  </div>
                  <p
                    className={`text-xs mt-0.5 truncate ${
                      job.status === "failed" ? "text-red-600" : "text-gray-500"
                    }`}
                    title={
                      job.status === "failed"
                        ? (job.errorMessage ?? undefined)
                        : undefined
                    }
                  >
                    {job.status === "failed" && job.errorMessage
                      ? job.errorMessage
                      : statusLabel(job, pos)}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    {job.status === "awaiting_approval" && href && (
                      <button
                        type="button"
                        onClick={() => navigate(href)}
                        className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-md border-0 cursor-pointer transition-colors"
                      >
                        Review
                      </button>
                    )}
                    {job.status === "done" && href && (
                      <button
                        type="button"
                        onClick={() => navigate(href)}
                        className="text-[11px] font-medium text-gray-700 border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-md bg-white cursor-pointer transition-colors"
                      >
                        Open
                      </button>
                    )}
                    {(job.status === "pending" || job.status === "running") && (
                      <button
                        type="button"
                        onClick={() => void cancel(job.id)}
                        className="text-[11px] text-gray-500 hover:text-red-600 border-0 bg-transparent p-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {isTerminal && (
                  <button
                    type="button"
                    onClick={() => dismiss(job.id)}
                    className="text-gray-300 hover:text-gray-500 border-0 bg-transparent p-1 cursor-pointer"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
