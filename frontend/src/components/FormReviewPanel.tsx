import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { postGenerateFieldAnswer } from "../api";
import type { ClassifiedField, GeneratedAnswer } from "../api";

interface FormReviewPanelProps {
  fields: ClassifiedField[];
  answers: GeneratedAnswer[];
  onChange: (answers: GeneratedAnswer[]) => void;
  readOnly?: boolean;
  jobRef?: string;
  submitted?: boolean;
}

const INTENT_LABELS: Record<string, string> = {
  phone: "Phone number",
  email: "Email address",
  full_name: "Full name",
  linkedin_url: "LinkedIn URL",
  website_url: "Website",
  github_url: "GitHub URL",
  address: "Address",
  work_authorization: "Work authorization",
  visa_sponsorship: "Visa sponsorship",
  relocation_willingness: "Willing to relocate",
  availability_start_date: "Available start date",
  degree_status: "Degree status",
  graduation_date: "Graduation date",
  major: "Major",
  gpa: "GPA",
  eeo_gender: "Gender (voluntary)",
  eeo_race: "Race/ethnicity (voluntary)",
  eeo_veteran_status: "Veteran status (voluntary)",
  eeo_disability: "Disability status (voluntary)",
  screening_yes_no: "Screening question",
  screening_open_ended: "Screening question",
  referral_source: "How did you hear about us?",
  referral_details: "Referral details",
  data_sharing_consent: "Data sharing consent",
  unknown: "Other question",
};

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  profile: {
    label: "From profile",
    color: "bg-green-900/40 text-green-300 border-green-700/50",
  },
  saved_answer: {
    label: "Saved answer",
    color: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  },
  ai_generated: {
    label: "AI generated",
    color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  },
  default_rule: {
    label: "Default",
    color: "bg-gray-900/40 text-gray-300 border-gray-700/50",
  },
  user_manual: {
    label: "Manual",
    color: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  },
};

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.85
      ? "bg-green-400"
      : confidence >= 0.6
        ? "bg-yellow-400"
        : "bg-red-400";
  const label =
    confidence >= 0.85
      ? "High confidence"
      : confidence >= 0.6
        ? "Medium confidence"
        : "Low confidence";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color}`}
      title={`${label} (${(confidence * 100).toFixed(0)}%)`}
    />
  );
}

export function FormReviewPanel({
  fields,
  answers,
  onChange,
  readOnly = false,
  jobRef,
  submitted = false,
}: FormReviewPanelProps) {
  const answerMap = useMemo(
    () => new Map(answers.map((a) => [a.fieldId, a])),
    [answers],
  );
  const effectiveReadOnly = readOnly || submitted;

  // Track initial values to detect user edits during this session.
  const initialRef = useRef<Map<string, unknown> | null>(null);
  useEffect(() => {
    if (initialRef.current) return;
    if (!answers || answers.length === 0) return;
    initialRef.current = new Map(answers.map((a) => [a.fieldId, a.value]));
  }, [answers]);

  const dynamicFields = fields.filter((f) => f.fieldType !== "file_upload");

  const groups = useMemo(() => {
    const map = new Map<string, ClassifiedField[]>();
    for (const f of dynamicFields) {
      const key = f.sectionHeading || "Application Questions";
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [dynamicFields]);

  const updateAnswer = useCallback(
    (
      fieldId: string,
      value: string | string[],
      source?: "user_manual" | "ai_generated",
    ) => {
      const updated = answers.map((a) =>
        a.fieldId === fieldId
          ? {
              ...a,
              value,
              source: source ?? ("user_manual" as const),
              requiresReview: false,
            }
          : a,
      );
      onChange(updated);
    },
    [answers, onChange],
  );

  const markReviewed = useCallback(
    (fieldId: string) => {
      const updated = answers.map((a) =>
        a.fieldId === fieldId ? { ...a, requiresReview: false } : a,
      );
      onChange(updated);
    },
    [answers, onChange],
  );

  const reviewAll = useCallback(() => {
    const updated = answers.map((a) => {
      const hasValue = Array.isArray(a.value) ? a.value.length > 0 : !!a.value;
      return hasValue ? { ...a, requiresReview: false } : a;
    });
    onChange(updated);
  }, [answers, onChange]);

  if (dynamicFields.length === 0) return null;

  const filledCount = dynamicFields.filter((f) => {
    const a = answerMap.get(f.id);
    return a && a.value && (!Array.isArray(a.value) || a.value.length > 0);
  }).length;
  const reviewCount = dynamicFields.filter((f) => {
    const a = answerMap.get(f.id);
    return a?.requiresReview && a.value;
  }).length;
  const editedCount = dynamicFields.filter((f) => {
    const a = answerMap.get(f.id);
    if (!a) return false;
    if (a.source !== "user_manual") return false;
    const initial = initialRef.current?.get(a.fieldId);
    return (
      initial !== undefined &&
      JSON.stringify(initial) !== JSON.stringify(a.value)
    );
  }).length;

  return (
    <div className="space-y-4 lg:max-w-3xl lg:mx-auto">
      {submitted && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
          <div className="text-sm font-semibold text-blue-900">
            This application has been submitted. Editing is disabled.
          </div>
          <div className="text-xs text-blue-700 mt-1">
            Answers are shown below for reference.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            <strong>{filledCount}</strong> of{" "}
            <strong>{dynamicFields.length}</strong> answered
          </span>
          {reviewCount > 0 && (
            <span className="text-amber-700">
              · <strong>{reviewCount}</strong> need review
            </span>
          )}
          {editedCount > 0 && (
            <span className="text-indigo-700">
              · <strong>{editedCount}</strong> edited
            </span>
          )}
        </div>

        {!effectiveReadOnly && reviewCount > 0 && (
          <button
            type="button"
            onClick={reviewAll}
            className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 cursor-pointer transition-colors"
          >
            Review all
          </button>
        )}
      </div>
      {Array.from(groups.entries()).map(([heading, fieldGroup]) => (
        <div
          key={heading}
          className="rounded-xl border border-gray-200 p-4 bg-white"
        >
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            {heading}
          </h4>
          <div className="space-y-3">
            {fieldGroup.map((field) => {
              const answer = answerMap.get(field.id);
              return (
                <FieldRow
                  key={field.id}
                  field={field}
                  answer={answer}
                  readOnly={effectiveReadOnly}
                  jobRef={jobRef}
                  onUpdate={(value, source) =>
                    updateAnswer(field.id, value, source)
                  }
                  onMarkReviewed={() => markReviewed(field.id)}
                  initialValue={initialRef.current?.get(field.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldRow({
  field,
  answer,
  readOnly,
  jobRef,
  onUpdate,
  onMarkReviewed,
  initialValue,
}: {
  field: ClassifiedField;
  answer: GeneratedAnswer | undefined;
  readOnly: boolean;
  jobRef?: string;
  onUpdate: (
    value: string | string[],
    source?: "user_manual" | "ai_generated",
  ) => void;
  onMarkReviewed: () => void;
  initialValue?: unknown;
}) {
  const value = answer ? answer.value : "";
  const sourceBadge = answer ? SOURCE_BADGES[answer.source] : null;
  const intentLabel = INTENT_LABELS[field.intent] || field.intent;
  const hasValue = answer
    ? Array.isArray(answer.value)
      ? answer.value.length > 0
      : !!answer.value
    : false;
  const showNeedsReview = !!answer?.requiresReview && hasValue;
  const isEdited =
    !!answer &&
    answer.source === "user_manual" &&
    initialValue !== undefined &&
    JSON.stringify(initialValue) !== JSON.stringify(answer.value);

  const status: "needs_review" | "reviewed" | "edited" = isEdited
    ? "edited"
    : showNeedsReview
      ? "needs_review"
      : "reviewed";
  const [aiLoading, setAiLoading] = useState(false);

  const handleAskAI = async () => {
    if (!jobRef || aiLoading) return;
    setAiLoading(true);
    try {
      const result = await postGenerateFieldAnswer(jobRef, field.id);
      if (result.value) {
        onUpdate(result.value, "ai_generated");
      }
    } catch {
      // silently ignore
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      className={`p-3 rounded-xl border ${
        status === "needs_review"
          ? "border-amber-200 bg-amber-50"
          : status === "edited"
            ? "border-indigo-200 bg-indigo-50/40"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {/* Buttons */}
        <div className="order-1 md:order-2 flex items-center gap-2 flex-shrink-0 lg:ml-auto">
          {!readOnly && jobRef && (
            <button
              type="button"
              onClick={handleAskAI}
              disabled={aiLoading}
              className="text-xs px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 cursor-pointer transition-colors disabled:opacity-50"
            >
              {aiLoading ? "Generating…" : "Ask AI"}
            </button>
          )}
          {answer && <ConfidenceDot confidence={answer.confidence} />}
          {sourceBadge && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border ${sourceBadge.color}`}
            >
              {sourceBadge.label}
            </span>
          )}
          {status === "needs_review" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-100 text-amber-800">
              Needs review
            </span>
          )}
          {status === "edited" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-100 text-indigo-800">
              Edited
            </span>
          )}
          {status === "reviewed" && hasValue && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-200 bg-green-100 text-green-800">
              Reviewed
            </span>
          )}
        </div>
        {/* Label */}
        <div className="order-1 w-full md:w-auto md:flex-1 min-w-0">
          <label className="text-sm font-medium text-gray-900 block">
            {field.rawLabel || intentLabel}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          {field.rawInstructions && (
            <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
              {field.rawInstructions}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        {readOnly ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {Array.isArray(value) ? value.join(", ") : value || "(empty)"}
          </div>
        ) : (
          <FieldInput
            field={field}
            value={value}
            onUpdate={(v) => onUpdate(v)}
          />
        )}
      </div>

      {!readOnly && status === "needs_review" && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onMarkReviewed}
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-amber-800 hover:bg-amber-50 transition-colors"
          >
            Mark as reviewed
          </button>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onUpdate,
}: {
  field: ClassifiedField;
  value: string | string[];
  onUpdate: (value: string | string[]) => void;
}) {
  const [localValue, setLocalValue] = useState<string | string[]>(value);
  useEffect(() => setLocalValue(value), [value]);

  const handleChange = (newValue: string | string[]) => {
    setLocalValue(newValue);
    onUpdate(newValue);
  };

  switch (field.fieldType) {
    case "text":
      return (
        <input
          type="text"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-indigo-200 outline-none"
          value={
            typeof localValue === "string" ? localValue : (localValue[0] ?? "")
          }
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.rawLabel}
        />
      );

    case "textarea":
      return (
        <textarea
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-indigo-200 outline-none resize-y min-h-[90px]"
          value={
            typeof localValue === "string" ? localValue : (localValue[0] ?? "")
          }
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.rawLabel}
          rows={3}
        />
      );

    case "radio":
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options || []).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border cursor-pointer transition-colors
                ${
                  localValue === opt.value
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200"
                }`}
            >
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={localValue === opt.value}
                onChange={() => handleChange(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      );

    case "select":
      return (
        <select
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-indigo-200 outline-none"
          value={
            typeof localValue === "string" ? localValue : (localValue[0] ?? "")
          }
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">Select...</option>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "multi_select":
      return (
        <MultiSelectField
          field={field}
          value={localValue}
          onUpdate={handleChange}
        />
      );

    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
          <input
            type="checkbox"
            checked={localValue === "true" || localValue === "yes"}
            onChange={(e) => handleChange(e.target.checked ? "yes" : "no")}
            className="accent-accent"
          />
          {field.rawLabel}
        </label>
      );

    default:
      return (
        <input
          type="text"
          className="w-full px-2.5 py-1.5 rounded-md border border-border bg-input text-text text-[13px] outline-none focus:ring-1 focus:ring-accent"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.rawLabel}
        />
      );
  }
}

function MultiSelectField({
  field,
  value,
  onUpdate,
}: {
  field: ClassifiedField;
  value: string | string[];
  onUpdate: (value: string | string[]) => void;
}) {
  const opts = field.options ?? [];
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onUpdate(next);
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((v) => {
            const label = opts.find((o) => o.value === v)?.label ?? v;
            return (
              <span
                key={v}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border border-indigo-200 bg-indigo-50 text-indigo-800"
              >
                {label}
                <button
                  type="button"
                  className="text-indigo-700 hover:text-indigo-900"
                  onClick={() => toggle(v)}
                  aria-label={`Remove ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-gray-500">No selections yet.</div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {opts.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${
                checked
                  ? "border-indigo-200 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-indigo-200"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.value)}
                className="mt-0.5 accent-indigo-600"
              />
              <span className="text-gray-800">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
