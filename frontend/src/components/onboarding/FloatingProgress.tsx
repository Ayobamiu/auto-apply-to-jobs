import { useOnboarding } from "../../hooks/useOnboarding";
import { useNavigate } from "react-router-dom";

const CIRCUMFERENCE = 2 * Math.PI * 13;

export function FloatingProgress() {
  const navigate = useNavigate();
  const {
    completedCount,
    totalCount,
    progressPercent,
    nextTask,
    isComplete,
    loading,
  } = useOnboarding();

  if (loading || isComplete) return null;

  const strokeOffset = CIRCUMFERENCE - (progressPercent / 100) * CIRCUMFERENCE;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => nextTask && navigate(nextTask.href)}
        className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm hover:border-gray-300 transition-colors"
      >
        {/* Ring */}
        <div className="relative w-8 h-8 shrink-0">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            className="-rotate-90"
          >
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="2.5"
            />
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.4s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-700">
            {completedCount}/{totalCount}
          </span>
        </div>

        {/* Text */}
        <div className="text-left">
          <p className="text-xs font-medium text-gray-800 leading-tight">
            Setup in progress
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
            Next: {nextTask?.label} →
          </p>
        </div>
      </button>
    </div>
  );
}
