import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Save,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
} from "lucide-react";
import { getProfile, putProfile } from "../../api";
import { useOnboarding } from "../../hooks/useOnboarding";
import {
  Profile,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  SkillEntry,
  DataCompliance,
  SaveStatus,
} from "../../types/profile";
import {
  MONTHS,
  DEGREE_OPTIONS,
  DEGREE_STATUS_OPTIONS,
  DISCIPLINE_OPTIONS,
  EEO_DISABILITY_OPTIONS,
  EEO_GENDER_OPTIONS,
  EEO_RACE_OPTIONS,
  EEO_VETERAN_OPTIONS,
  REFERRAL_OPTIONS,
  WORK_AUTH_OPTIONS,
} from "../../utils/profile";
import { ProfileCompletionMeter } from "./ProfileCompletionMeter";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => String(currentYear - i));
const FUTURE_YEARS = Array.from({ length: 10 }, (_, i) =>
  String(currentYear + i),
);

// ─────────────────────────────────────────────────────────────────────────────
// University data — fetched lazily from jsDelivr
// ─────────────────────────────────────────────────────────────────────────────

let cachedUniversities: string[] | null = null;

async function fetchUniversities(): Promise<string[]> {
  if (cachedUniversities) return cachedUniversities;
  try {
    // world-universities package on jsDelivr — country code "US" filter applied client-side
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/world-universities@1.0.0/index.js",
    );
    const text = await res.text();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]") + 1;
    const arr: Array<{ major: string; name: string }> = JSON.parse(
      text.substring(start, end),
    );
    // Return all universities worldwide, sorted alphabetically
    cachedUniversities = arr.map((u) => u.name).sort();
    return cachedUniversities;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable atoms
// ─────────────────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const inputClass =
  "w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition-colors";

const labelClass = "block text-xs font-medium text-gray-500 mb-1.5";

interface LabeledFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

function LabeledField({ label, hint, children, className }: LabeledFieldProps) {
  return (
    <div className={cx("flex flex-col", className)}>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}

function Section({
  title,
  description,
  defaultOpen = true,
  children,
  action,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>
      {open && <div className="px-5 py-5 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Autocomplete input ───────────────────────────────────────────────────────

interface AutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  options: string[] | (() => Promise<string[]>);
  placeholder?: string;
  label?: string;
}

function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
}: AutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allOptions, setAllOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Sync internal query when value changes externally
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Load options
  useEffect(() => {
    if (typeof options === "function") {
      setLoading(true);
      options().then((opts) => {
        setAllOptions(opts);
        setLoading(false);
      });
    } else {
      setAllOptions(options);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    setResults(
      allOptions.filter((o) => o.toLowerCase().includes(q)).slice(0, 8),
    );
  }, [query, allOptions]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (opt: string) => {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" && results[0]) select(results[0]);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className={inputClass}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query && setOpen(true)}
        onKeyDown={handleKey}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 animate-spin" />
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.map((r) => (
            <li key={r}>
              <button
                type="button"
                onMouseDown={() => select(r)}
                className="w-full px-3.5 py-2 text-sm text-left text-gray-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {r}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}

function Select({ value, onChange, options, placeholder }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(inputClass, !value && "text-gray-400")}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o} value={o} className="text-gray-900">
          {o}
        </option>
      ))}
    </select>
  );
}

// ─── MonthYear picker ─────────────────────────────────────────────────────────

interface MonthYearProps {
  monthValue?: string;
  yearValue?: string;
  onMonthChange: (v: string) => void;
  onYearChange: (v: string) => void;
  includeFuture?: boolean;
  allowPresent?: boolean;
}

function MonthYearPicker({
  monthValue,
  yearValue,
  onMonthChange,
  onYearChange,
  includeFuture = false,
  allowPresent = false,
}: MonthYearProps) {
  let yearOptions = includeFuture
    ? [...FUTURE_YEARS, ...YEARS]
    : allowPresent
      ? ["Present", ...YEARS]
      : YEARS;
  //make the year options unique
  yearOptions = [...new Set(yearOptions)];

  return (
    <div className="flex gap-2">
      <select
        value={monthValue ?? ""}
        onChange={(e) => onMonthChange(e.target.value)}
        className={cx(inputClass, "flex-1", !monthValue && "text-gray-400")}
      >
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={yearValue ?? ""}
        onChange={(e) => onYearChange(e.target.value)}
        className={cx(inputClass, "flex-[1.5]", !yearValue && "text-gray-400")}
      >
        <option value="">Year</option>
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={cx(
            "w-10 h-6 rounded-full transition-colors",
            checked ? "bg-blue-500" : "bg-gray-200",
          )}
        />
        <div
          className={cx(
            "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          )}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

// ─── Chips input (preferred_locations) ───────────────────────────────────────

interface ChipsInputProps {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

function ChipsInput({ values, onChange, placeholder }: ChipsInputProps) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };

  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div
      className={cx(
        inputClass,
        "min-h-[2.75rem] h-auto flex flex-wrap gap-1.5 items-center cursor-text p-2",
      )}
      onClick={(e) =>
        (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()
      }
    >
      {values.map((v, i) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md font-medium"
        >
          {v}
          <button
            type="button"
            onClick={() => remove(i)}
            className="hover:text-blue-900"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !input && values.length) {
            remove(values.length - 1);
          }
        }}
        onBlur={add}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-24 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
      />
    </div>
  );
}

// ─── Bullets editor ───────────────────────────────────────────────────────────

interface BulletsEditorProps {
  bullets: string[];
  onChange: (b: string[]) => void;
  placeholder?: string;
}

function BulletsEditor({
  bullets,
  onChange,
  placeholder = "Add bullet point…",
}: BulletsEditorProps) {
  const update = (i: number, v: string) => {
    const next = [...bullets];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(bullets.filter((_, idx) => idx !== i));
  const add = () => onChange([...bullets, ""]);

  return (
    <div className="space-y-1.5">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            value={b}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className={cx(inputClass, "flex-1")}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add bullet
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Experience
// ─────────────────────────────────────────────────────────────────────────────

interface ExperienceEditorProps {
  entries: ExperienceEntry[];
  onChange: (e: ExperienceEntry[]) => void;
}

function ExperienceEditor({ entries, onChange }: ExperienceEditorProps) {
  const update = (i: number, patch: Partial<ExperienceEntry>) => {
    const next = [...entries];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { bullets: [] }]);

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Position {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledField label="Job title">
              <input
                type="text"
                value={entry.title ?? ""}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Software Engineer"
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label="Company">
              <input
                type="text"
                value={entry.company ?? ""}
                onChange={(e) => update(i, { company: e.target.value })}
                placeholder="Acme Corp"
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label="Location">
              <input
                type="text"
                value={entry.location ?? ""}
                onChange={(e) => update(i, { location: e.target.value })}
                placeholder="San Francisco, CA"
                className={inputClass}
              />
            </LabeledField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Start date">
              <MonthYearPicker
                monthValue={
                  entry.startMonth ? String(entry.startMonth) : undefined
                }
                yearValue={
                  entry.startYear ? String(entry.startYear) : undefined
                }
                onMonthChange={(v) => update(i, { startMonth: v })}
                onYearChange={(v) => update(i, { startYear: v })}
              />
            </LabeledField>
            <LabeledField label="End date">
              <MonthYearPicker
                monthValue={entry.endMonth ? String(entry.endMonth) : undefined}
                yearValue={entry.endYear ? String(entry.endYear) : undefined}
                onMonthChange={(v) => update(i, { endMonth: v })}
                onYearChange={(v) => update(i, { endYear: v })}
                allowPresent
              />
            </LabeledField>
          </div>
          <LabeledField label="Highlights">
            <BulletsEditor
              bullets={entry.bullets ?? []}
              onChange={(b) => update(i, { bullets: b })}
              placeholder="Describe a key accomplishment…"
            />
          </LabeledField>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add position
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Education
// ─────────────────────────────────────────────────────────────────────────────

interface EducationEditorProps {
  entries: EducationEntry[];
  onChange: (e: EducationEntry[]) => void;
}

function EducationEditor({ entries, onChange }: EducationEditorProps) {
  const update = (i: number, patch: Partial<EducationEntry>) => {
    const next = [...entries];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, {}]);

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Education {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <LabeledField label="School / Institution">
            <Autocomplete
              value={entry.school ?? ""}
              onChange={(v) => update(i, { school: v })}
              options={fetchUniversities}
              placeholder="Search universities…"
            />
          </LabeledField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledField label="Degree">
              <Autocomplete
                value={entry.degree ?? ""}
                onChange={(v) => update(i, { degree: v })}
                options={DEGREE_OPTIONS}
                placeholder="e.g. Bachelor of Science (BS)"
              />
            </LabeledField>
            <LabeledField label="Discipline / Field of study">
              <Autocomplete
                value={entry.discipline ?? ""}
                onChange={(v) => update(i, { discipline: v })}
                options={DISCIPLINE_OPTIONS}
                placeholder="e.g. Computer Science"
              />
            </LabeledField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Start date">
              <MonthYearPicker
                monthValue={
                  entry.startMonth ? String(entry.startMonth) : undefined
                }
                yearValue={
                  entry.startYear ? String(entry.startYear) : undefined
                }
                onMonthChange={(v) => update(i, { startMonth: v })}
                onYearChange={(v) => update(i, { startYear: v })}
              />
            </LabeledField>
            <LabeledField label="End date (or expected)">
              <MonthYearPicker
                monthValue={entry.endMonth ? String(entry.endMonth) : undefined}
                yearValue={entry.endYear ? String(entry.endYear) : undefined}
                onMonthChange={(v) => update(i, { endMonth: v })}
                onYearChange={(v) => {
                  update(i, { endYear: v, year: v });
                }}
                includeFuture
              />
            </LabeledField>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add education
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Projects
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectsEditorProps {
  entries: ProjectEntry[];
  onChange: (e: ProjectEntry[]) => void;
}

function ProjectsEditor({ entries, onChange }: ProjectsEditorProps) {
  const update = (i: number, patch: Partial<ProjectEntry>) => {
    const next = [...entries];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { bullets: [] }]);

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Project {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <LabeledField label="Project name">
            <input
              type="text"
              value={entry.name ?? ""}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="My Awesome Project"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Highlights">
            <BulletsEditor
              bullets={entry.bullets ?? []}
              onChange={(b) => update(i, { bullets: b })}
              placeholder="Describe what you built or achieved…"
            />
          </LabeledField>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add project
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Skills
// ─────────────────────────────────────────────────────────────────────────────

interface SkillsEditorProps {
  entries: SkillEntry[];
  onChange: (e: SkillEntry[]) => void;
}

function SkillsEditor({ entries, onChange }: SkillsEditorProps) {
  const update = (i: number, patch: Partial<SkillEntry>) => {
    const next = [...entries];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { category: "", keywords: [] }]);

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 border border-gray-50 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 flex-shrink-0">
              <input
                type="text"
                value={entry.category ?? ""}
                onChange={(e) => update(i, { category: e.target.value })}
                placeholder="Category"
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-1 p-2 text-gray-400 hover:text-red-500 transition-colors rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1">
            <ChipsInput
              values={entry.keywords ?? []}
              onChange={(kw) => update(i, { keywords: kw })}
              placeholder="Add skills, press Enter…"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add skill category
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main form
// ─────────────────────────────────────────────────────────────────────────────

export function ProfileFormSection() {
  const { refetch: refetchOnboarding } = useOnboarding();
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [profile, setProfile] = useState<Profile>({});
  const [dirty, setDirty] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const patch = useCallback((updates: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }, []);

  const field = (key: keyof Profile) => ({
    value: (profile[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patch({ [key]: e.target.value }),
  });

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getProfile();
      const p = (res.profile ?? {}) as Profile;
      setProfile({
        ...p,
        experience: Array.isArray(p.experience) ? p.experience : [],
        education: Array.isArray(p.education) ? p.education : [],
        projects: Array.isArray(p.projects) ? p.projects : [],
        skills: Array.isArray(p.skills) ? p.skills : [],
        preferred_locations: Array.isArray(p.preferred_locations)
          ? p.preferred_locations
          : [],
        data_compliance: p.data_compliance ?? {},
        requires_visa_sponsorship: p.requires_visa_sponsorship ?? false,
        willing_to_relocate: p.willing_to_relocate ?? false,
      });
      setStatus("idle");
      setDirty(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load profile",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setStatus("saving");
    setErrorMsg("");
    try {
      await putProfile(profile);
      setStatus("saved");
      setDirty(false);
      void refetchOnboarding();
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setStatus("error");
    }
  }, [profile, refetchOnboarding]);

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="space-y-3 animate-pulse">
        {[80, 56, 64, 48, 72, 56].map((h, i) => (
          <div
            key={i}
            style={{ height: h }}
            className="bg-gray-100 rounded-xl"
          />
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-6">
      {/* Error banner */}
      {errorMsg && status === "error" && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">
              Something went wrong
            </p>
            <p className="text-sm text-red-600 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      <ProfileCompletionMeter profile={profile} />

      {/* ── 1. Personal info ──────────────────────────────────────────────── */}
      <Section
        title="Personal information"
        description="Your core contact details"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledField label="Full name">
            <input
              type="text"
              {...field("name")}
              placeholder="Jane Smith"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Job title / headline">
            <input
              type="text"
              {...field("title")}
              placeholder="Software Engineer"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Email">
            <input
              type="email"
              {...field("email")}
              placeholder="jane@example.com"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Phone">
            <input
              type="tel"
              {...field("phone")}
              placeholder="+1 (555) 000-0000"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Location">
            <input
              type="text"
              {...field("location")}
              placeholder="New York, NY"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Website">
            <input
              type="url"
              {...field("website")}
              placeholder="https://yoursite.com"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="LinkedIn URL">
            <input
              type="url"
              {...field("linkedin")}
              placeholder="https://linkedin.com/in/…"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="GitHub URL">
            <input
              type="url"
              {...field("github")}
              placeholder="https://github.com/…"
              className={inputClass}
            />
          </LabeledField>
        </div>
        <LabeledField label="Professional summary">
          <textarea
            value={profile.summary ?? ""}
            onChange={(e) => patch({ summary: e.target.value })}
            rows={4}
            placeholder="A brief description of your experience and goals…"
            className={cx(inputClass, "resize-none")}
          />
        </LabeledField>
      </Section>

      {/* ── 2. Work experience ───────────────────────────────────────────── */}
      <Section
        title="Work experience"
        description="Your positions, in reverse chronological order"
        defaultOpen
      >
        <ExperienceEditor
          entries={profile.experience ?? []}
          onChange={(e) => patch({ experience: e })}
        />
      </Section>

      {/* ── 3. Education ──────────────────────────────────────────────────── */}
      <Section
        title="Education"
        description="Degrees, certificates, and schools"
      >
        <EducationEditor
          entries={profile.education ?? []}
          onChange={(e) => patch({ education: e })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <LabeledField
            label="Current degree status"
            hint="Shown when currently enrolled"
          >
            <Select
              value={profile.current_degree_status ?? ""}
              onChange={(v) => patch({ current_degree_status: v })}
              options={DEGREE_STATUS_OPTIONS}
              placeholder="Select status…"
            />
          </LabeledField>
          <LabeledField label="Expected graduation" hint="e.g. May 2026">
            <input
              type="text"
              value={profile.expected_graduation ?? ""}
              onChange={(e) => patch({ expected_graduation: e.target.value })}
              placeholder="May 2026"
              className={inputClass}
            />
          </LabeledField>
        </div>
      </Section>

      {/* ── 4. Projects ───────────────────────────────────────────────────── */}
      <Section
        title="Projects"
        description="Side projects, open-source contributions, portfolio work"
        defaultOpen={false}
      >
        <ProjectsEditor
          entries={profile.projects ?? []}
          onChange={(e) => patch({ projects: e })}
        />
      </Section>

      {/* ── 5. Skills ─────────────────────────────────────────────────────── */}
      <Section
        title="Skills"
        description="Group your skills by category (e.g. Languages, Frameworks, Tools)"
        defaultOpen={false}
      >
        <SkillsEditor
          entries={profile.skills ?? []}
          onChange={(e) => patch({ skills: e })}
        />
      </Section>

      {/* ── 6. Job preferences ────────────────────────────────────────────── */}
      <Section
        title="Job preferences"
        description="Helps pre-fill application forms faster"
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledField label="Work authorization">
            <Select
              value={profile.work_authorization ?? ""}
              onChange={(v) => patch({ work_authorization: v })}
              options={WORK_AUTH_OPTIONS}
              placeholder="Select authorization…"
            />
          </LabeledField>
          <LabeledField
            label="Availability start date"
            hint="When you can start a new role"
          >
            <input
              type="text"
              value={profile.availability_start_date ?? ""}
              onChange={(e) =>
                patch({ availability_start_date: e.target.value })
              }
              className={inputClass}
              placeholder="e.g. June 2026, Immediately"
            />
          </LabeledField>
          <LabeledField
            label="Resume URL"
            hint="Link to your stored resume file"
          >
            <input
              type="url"
              {...field("resume_url")}
              placeholder="https://…"
              className={inputClass}
            />
          </LabeledField>
          <LabeledField label="Cover letter URL">
            <input
              type="url"
              {...field("cover_letter_url")}
              placeholder="https://…"
              className={inputClass}
            />
          </LabeledField>
        </div>
        <LabeledField
          label="Preferred locations"
          hint="Press Enter or comma to add. Leave blank for remote-only or no preference."
        >
          <ChipsInput
            values={profile.preferred_locations ?? []}
            onChange={(v) => patch({ preferred_locations: v })}
            placeholder="e.g. San Francisco, Remote, New York…"
          />
        </LabeledField>
        <div className="space-y-3 pt-1">
          <Toggle
            checked={profile.requires_visa_sponsorship ?? false}
            onChange={(v) => patch({ requires_visa_sponsorship: v })}
            label="Requires visa sponsorship"
            description="Employers will know you need sponsorship"
          />
          <Toggle
            checked={profile.willing_to_relocate ?? false}
            onChange={(v) => patch({ willing_to_relocate: v })}
            label="Willing to relocate"
            description="Shown to employers when location is outside your current city"
          />
        </div>
      </Section>

      {/* ── 7. EEO & compliance (collapsed by default) ────────────────────── */}
      <Section
        title="Equal opportunity & compliance"
        description="Optional. Many employers request this for legal compliance. Answers are confidential."
        defaultOpen={false}
      >
        <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-3">
          These questions are voluntary and used solely for equal employment
          opportunity reporting. Your answers will not affect hiring decisions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledField label="Gender">
            <Select
              value={profile.eeo_gender ?? ""}
              onChange={(v) => patch({ eeo_gender: v })}
              options={EEO_GENDER_OPTIONS}
              placeholder="Select…"
            />
          </LabeledField>
          <LabeledField label="Race / ethnicity">
            <Select
              value={profile.eeo_race ?? ""}
              onChange={(v) => patch({ eeo_race: v })}
              options={EEO_RACE_OPTIONS}
              placeholder="Select…"
            />
          </LabeledField>
          <LabeledField label="Veteran status">
            <Select
              value={profile.eeo_veteran_status ?? ""}
              onChange={(v) => patch({ eeo_veteran_status: v })}
              options={EEO_VETERAN_OPTIONS}
              placeholder="Select…"
            />
          </LabeledField>
          <LabeledField label="Disability status">
            <Select
              value={profile.eeo_disability_status ?? ""}
              onChange={(v) => patch({ eeo_disability_status: v })}
              options={EEO_DISABILITY_OPTIONS}
              placeholder="Select…"
            />
          </LabeledField>
          <LabeledField label="How did you hear about us?">
            <Select
              value={profile.referral_source ?? ""}
              onChange={(v) => patch({ referral_source: v })}
              options={REFERRAL_OPTIONS}
              placeholder="Select…"
            />
          </LabeledField>
        </div>

        {/* GDPR compliance toggles */}
        <div className="pt-2 space-y-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            GDPR data consent
          </p>
          {(
            [
              {
                key: "gdpr_processing_consent_given" as const,
                label: "Processing consent",
                description:
                  "Allow employers to process your personal data for hiring purposes",
              },
              {
                key: "gdpr_retention_consent_given" as const,
                label: "Retention consent",
                description:
                  "Allow employers to retain your data after the hiring process",
              },
              {
                key: "gdpr_demographic_data_consent_given" as const,
                label: "Demographic data consent",
                description:
                  "Allow processing of demographic/EEO data for compliance reporting",
              },
            ] as const
          ).map(({ key, label, description }) => (
            <Toggle
              key={key}
              checked={profile.data_compliance?.[key] ?? false}
              onChange={(v) =>
                patch({
                  data_compliance: { ...profile.data_compliance, [key]: v },
                })
              }
              label={label}
              description={description}
            />
          ))}
        </div>
      </Section>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-3 bg-white/80 backdrop-blur-sm border-t border-gray-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || status === "saving"}
          className={cx(
            "inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            status === "saved"
              ? "bg-green-500 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white",
          )}
        >
          {status === "saving" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === "saved" ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved!"
              : "Save changes"}
        </button>
        {dirty && status !== "saving" && status !== "saved" && (
          <span className="ml-3 text-xs text-gray-400">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
