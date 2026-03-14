import { useCallback, useEffect, useState } from "react";
import { Save, Loader2, Check, AlertCircle } from "lucide-react";
import { getProfile, putProfile } from "../../api";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

const SIMPLE_FIELDS: { key: string; label: string; placeholder: string; type?: string }[] = [
  { key: "name", label: "Full name", placeholder: "Jane Smith" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 (555) 000-0000" },
  { key: "location", label: "Location", placeholder: "New York, NY" },
  { key: "title", label: "Job title / headline", placeholder: "Software Engineer" },
  { key: "linkedin", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/…" },
  { key: "github", label: "GitHub URL", placeholder: "https://github.com/…" },
];

export function ProfileFormSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [dirty, setDirty] = useState(false);

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getProfile();
      const p = (res.profile ?? {}) as Record<string, unknown>;
      const flat: Record<string, string> = {};
      for (const f of SIMPLE_FIELDS) {
        flat[f.key] = typeof p[f.key] === "string" ? (p[f.key] as string) : "";
      }
      setFields(flat);
      setSummary(typeof p.summary === "string" ? p.summary : "");
      setStatus("idle");
      setDirty(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load profile");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const handleChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSummaryChange = (v: string) => {
    setSummary(v);
    setDirty(true);
  };

  const handleSave = useCallback(async () => {
    setStatus("saving");
    setErrorMsg("");
    try {
      await putProfile({ ...fields, summary });
      setStatus("saved");
      setDirty(false);
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setStatus("error");
    }
  }, [fields, summary]);

  if (status === "loading") {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorMsg && status === "error" && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SIMPLE_FIELDS.map(({ key, label, placeholder, type }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {label}
            </label>
            <input
              type={type ?? "text"}
              value={fields[key] ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Professional summary
        </label>
        <textarea
          value={summary}
          onChange={(e) => handleSummaryChange(e.target.value)}
          rows={4}
          placeholder="A brief description of your experience and goals…"
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || status === "saving"}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed border-0 cursor-pointer transition-colors"
      >
        {status === "saving" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === "saved" ? (
          <Check className="w-4 h-4" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved!" : "Save changes"}
      </button>
    </div>
  );
}
