import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../hooks/useOnboarding";

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
      <path
        d="M1 4l3 3 5-6"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7h8M7 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const { tasks, completedCount, totalCount, progressPercent, loading } =
    useOnboarding();

  if (loading) return null;

  const nextTaskIndex = tasks.findIndex((t) => !t.done);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-medium text-gray-900">
            Finish setting up your account
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {completedCount === totalCount
              ? "You're all set — start searching!"
              : "Complete these steps to start applying"}
          </p>
        </div>
        <span className="text-xs text-gray-400 mt-0.5 shrink-0 ml-4">
          {completedCount} / {totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden my-3">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Task list */}
      <ul className="space-y-0.5">
        {tasks.map((task, i) => {
          const isNext = i === nextTaskIndex;
          return (
            <li key={task.id}>
              <button
                onClick={() => navigate(task.href)}
                className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left transition-colors
                  ${task.done ? "opacity-60" : "hover:bg-gray-50"}
                  ${isNext ? "bg-emerald-50 hover:bg-emerald-50" : ""}
                `}
              >
                {/* Circle check */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all
                    ${
                      task.done
                        ? "bg-emerald-500 border-emerald-500 border"
                        : isNext
                          ? "border border-emerald-400"
                          : "border border-gray-200"
                    }
                  `}
                >
                  {task.done && <CheckIcon />}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium leading-tight ${task.done ? "line-through text-gray-400" : isNext ? "text-emerald-700" : "text-gray-800"}`}
                  >
                    {task.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {task.description}
                  </p>
                </div>

                {/* Arrow */}
                {!task.done && (
                  <span
                    className={`shrink-0 ${isNext ? "text-emerald-500" : "text-gray-300"}`}
                  >
                    <ArrowIcon />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
