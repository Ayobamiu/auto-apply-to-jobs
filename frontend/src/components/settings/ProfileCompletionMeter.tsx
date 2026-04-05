import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ExpandIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { Profile } from "../../types/profile";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Completion spec
// Each field has a weight (points) and a predicate.
// Sections group fields for the breakdown UI.
// Total possible points = sum of all weights.
// Auto-submit requires all "required" fields + score >= AUTO_SUBMIT_THRESHOLD.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldCheck {
  key: string;
  label: string;
  /** Points awarded when satisfied */
  weight: number;
  /** Must be satisfied for auto-submit eligibility */
  required: boolean;
  satisfied: (p: Profile) => boolean;
}

export interface SectionCompletion {
  title: string;
  fields: FieldCheck[];
  earned: number;
  possible: number;
  pct: number;
}

export interface CompletionResult {
  score: number; // 0–100
  earned: number;
  possible: number;
  sections: SectionCompletion[];
  missingRequired: FieldCheck[];
  canAutoSubmit: boolean;
}

/** Minimum overall score (0–100) needed for auto-submit, on top of all required fields. */
const AUTO_SUBMIT_THRESHOLD = 80;

const FIELD_SPEC: { section: string; fields: FieldCheck[] }[] = [
  {
    section: "Personal info",
    fields: [
      {
        key: "name",
        label: "Full name",
        weight: 10,
        required: true,
        satisfied: (p) => !!p.name?.trim(),
      },
      {
        key: "email",
        label: "Email address",
        weight: 10,
        required: true,
        satisfied: (p) => !!p.email?.trim(),
      },
      {
        key: "phone",
        label: "Phone number",
        weight: 8,
        required: true,
        satisfied: (p) => !!p.phone?.trim(),
      },
      {
        key: "location",
        label: "Location",
        weight: 6,
        required: true,
        satisfied: (p) => !!p.location?.trim(),
      },
      {
        key: "title",
        label: "Job title / headline",
        weight: 5,
        required: false,
        satisfied: (p) => !!p.title?.trim(),
      },
      {
        key: "linkedin",
        label: "LinkedIn URL",
        weight: 5,
        required: false,
        satisfied: (p) => !!p.linkedin?.trim(),
      },
      {
        key: "summary",
        label: "Professional summary",
        weight: 6,
        required: false,
        satisfied: (p) => (p.summary?.trim().length ?? 0) >= 50,
      },
    ],
  },
  {
    section: "Experience",
    fields: [
      {
        key: "experience_exists",
        label: "At least one position",
        weight: 10,
        required: true,
        satisfied: (p) => (p.experience?.length ?? 0) >= 1,
      },
      {
        key: "experience_complete",
        label: "Position has title, company & dates",
        weight: 8,
        required: true,
        satisfied: (p) =>
          (p.experience ?? []).some(
            (e) => e.title?.trim() && e.company?.trim() && e.startYear,
          ),
      },
      {
        key: "experience_bullets",
        label: "At least one highlight bullet",
        weight: 4,
        required: false,
        satisfied: (p) =>
          (p.experience ?? []).some((e) => (e.bullets?.length ?? 0) >= 1),
      },
    ],
  },
  {
    section: "Education",
    fields: [
      {
        key: "education_exists",
        label: "At least one education entry",
        weight: 8,
        required: true,
        satisfied: (p) => (p.education?.length ?? 0) >= 1,
      },
      {
        key: "education_complete",
        label: "School, degree & field of study",
        weight: 6,
        required: true,
        satisfied: (p) =>
          (p.education ?? []).some(
            (e) => e.school?.trim() && e.degree?.trim() && e.discipline?.trim(),
          ),
      },
      {
        key: "education_dates",
        label: "Education dates",
        weight: 3,
        required: false,
        satisfied: (p) =>
          (p.education ?? []).some((e) => e.startYear && e.endYear),
      },
    ],
  },
  {
    section: "Skills",
    fields: [
      {
        key: "skills_exists",
        label: "At least one skill category",
        weight: 5,
        required: false,
        satisfied: (p) => (p.skills?.length ?? 0) >= 1,
      },
      {
        key: "skills_keywords",
        label: "Skills have keywords",
        weight: 3,
        required: false,
        satisfied: (p) =>
          (p.skills ?? []).some((s) => (s.keywords?.length ?? 0) >= 2),
      },
    ],
  },
  {
    section: "Job preferences",
    fields: [
      {
        key: "work_authorization",
        label: "Work authorization",
        weight: 5,
        required: true,
        satisfied: (p) => !!p.work_authorization?.trim(),
      },
      // {
      //   key: "resume_url",
      //   label: "Resume on file",
      //   weight: 6,
      //   required: true,
      //   satisfied: (p) => !!p.resume_url?.trim(),
      // },
      {
        key: "availability_start_date",
        label: "Availability date",
        weight: 3,
        required: false,
        satisfied: (p) => !!p.availability_start_date?.trim(),
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useProfileCompletion(profile: Profile): CompletionResult {
  return useMemo(() => {
    let totalEarned = 0;
    let totalPossible = 0;
    const missingRequired: FieldCheck[] = [];

    const sections: SectionCompletion[] = FIELD_SPEC.map(
      ({ section, fields }) => {
        let earned = 0;
        let possible = 0;

        for (const f of fields) {
          possible += f.weight;
          totalPossible += f.weight;
          if (f.satisfied(profile)) {
            earned += f.weight;
            totalEarned += f.weight;
          } else if (f.required) {
            missingRequired.push(f);
          }
        }

        return {
          title: section,
          fields,
          earned,
          possible,
          pct: possible > 0 ? Math.round((earned / possible) * 100) : 0,
        };
      },
    );

    const score =
      totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

    const canAutoSubmit =
      missingRequired.length === 0 && score >= AUTO_SUBMIT_THRESHOLD;

    return {
      score,
      earned: totalEarned,
      possible: totalPossible,
      sections,
      missingRequired,
      canAutoSubmit,
    };
  }, [profile]);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI component
// ─────────────────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Colour ramp: red → amber → green */
function scoreColor(score: number) {
  if (score >= AUTO_SUBMIT_THRESHOLD)
    return {
      ring: "text-green-500",
      bar: "bg-green-500",
      badge: "bg-green-50 text-green-700 border-green-200",
    };
  if (score >= 50)
    return {
      ring: "text-amber-500",
      bar: "bg-amber-500",
      badge: "bg-amber-50  text-amber-700  border-amber-200",
    };
  return {
    ring: "text-red-400",
    bar: "bg-red-400",
    badge: "bg-red-50    text-red-700    border-red-200",
  };
}

interface ProfileCompletionMeterProps {
  profile: Profile;
}

export function ProfileCompletionMeter({
  profile,
}: ProfileCompletionMeterProps) {
  const result = useProfileCompletion(profile);
  const { score, sections, missingRequired, canAutoSubmit } = result;
  const colors = scoreColor(score);

  const [showBreakdown, setShowBreakdown] = useState(false);
  // Arc math for the ring
  const R = 36;
  const CIRC = 2 * Math.PI * R;
  const dash = (score / 100) * CIRC;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden relative">
      <button
        type="button"
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="absolute top-4 right-4"
        title={showBreakdown ? "Hide breakdown" : "Show breakdown"}
      >
        {showBreakdown ? (
          <Minimize2Icon
            size={16}
            className="text-gray-500 hover:text-gray-700"
          />
        ) : (
          <Maximize2Icon
            size={16}
            className="text-gray-500 hover:text-gray-700"
          />
        )}
      </button>

      {/* ── Header row ── */}
      <div className="flex items-center gap-5 px-5 py-4 border-b border-gray-100">
        {/* Ring */}
        <div className="relative flex-shrink-0 w-20 h-20">
          <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
            <circle
              cx="44"
              cy="44"
              r={R}
              fill="none"
              stroke="currentColor"
              className="text-gray-100"
              strokeWidth="8"
            />
            <circle
              cx="44"
              cy="44"
              r={R}
              fill="none"
              stroke="currentColor"
              className={cx(
                colors.ring,
                "transition-all duration-700 ease-out",
              )}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
            />
          </svg>
          <span
            className={cx(
              "absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums",
              colors.ring,
            )}
          >
            {score}%
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800">
              Profile completion
            </h3>
            <span
              className={cx(
                "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border",
                colors.badge,
              )}
            >
              {canAutoSubmit ? (
                <>
                  <CheckCircle2 className="w-3 h-3" /> Ready to auto-submit
                </>
              ) : score >= 50 ? (
                <>
                  <AlertTriangle className="w-3 h-3" /> Almost ready
                </>
              ) : (
                <>
                  <Circle className="w-3 h-3" /> Needs more info
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {canAutoSubmit
              ? "Your profile has enough information for us to automatically fill and submit job applications."
              : `Reach ${AUTO_SUBMIT_THRESHOLD}% and fill all required fields to unlock auto-submit.`}
          </p>

          {/* Missing required pills */}
          {missingRequired.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {missingRequired.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-md border border-red-100"
                >
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section breakdown ── */}
      {showBreakdown && (
        <div className="px-5 py-4 space-y-3">
          {sections.map((sec) => (
            <div key={sec.title}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">
                  {sec.title}
                </span>
                <span
                  className={cx(
                    "text-xs font-semibold tabular-nums",
                    scoreColor(sec.pct).ring,
                  )}
                >
                  {sec.pct}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cx(
                    "h-full rounded-full transition-all duration-500",
                    scoreColor(sec.pct).bar,
                  )}
                  style={{ width: `${sec.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
