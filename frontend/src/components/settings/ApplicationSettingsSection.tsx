import { useState, useEffect, useCallback } from "react";
import {
  getExtendedProfile,
  putExtendedProfile,
  type ExtendedProfileFields,
} from "../../api";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

const WORK_AUTH_OPTIONS = [
  "U.S. Citizen",
  "Permanent Resident",
  "Visa Holder (F-1/OPT)",
  "Visa Holder (H-1B)",
  "Other",
];

const BOOL_OPTIONS = [
  { label: "Yes", value: true },
  { label: "No", value: false },
];

export function ApplicationSettingsSection() {
  const [fields, setFields] = useState<ExtendedProfileFields>({});
  const [status, setStatus] = useState<Status>("idle");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setStatus("loading");
    getExtendedProfile()
      .then((data) => {
        setFields(data);
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }, []);

  const handleChange = useCallback(
    <K extends keyof ExtendedProfileFields>(
      key: K,
      value: ExtendedProfileFields[K],
    ) => {
      setFields((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setStatus("saving");
    try {
      await putExtendedProfile(fields);
      setStatus("saved");
      setDirty(false);
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }, [fields]);

  if (status === "loading") {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        These fields are used to auto-fill application forms. Update them once
        and they'll be reused across all applications.
      </p>

      {/* Work authorization */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">
          Work Authorization
        </legend>
        <select
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
          value={fields.work_authorization || ""}
          onChange={(e) => handleChange("work_authorization", e.target.value)}
        >
          <option value="">Select...</option>
          {WORK_AUTH_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </fieldset>

      {/* Visa sponsorship */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">
          Requires visa sponsorship?
        </legend>
        <div className="flex gap-3">
          {BOOL_OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                fields.requires_visa_sponsorship === opt.value
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-200"
              }`}
            >
              <input
                type="radio"
                name="visa_sponsorship"
                checked={fields.requires_visa_sponsorship === opt.value}
                onChange={() =>
                  handleChange("requires_visa_sponsorship", opt.value)
                }
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Willing to relocate */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">
          Willing to relocate?
        </legend>
        <div className="flex gap-3">
          {BOOL_OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                fields.willing_to_relocate === opt.value
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-200"
              }`}
            >
              <input
                type="radio"
                name="relocate"
                checked={fields.willing_to_relocate === opt.value}
                onChange={() => handleChange("willing_to_relocate", opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Websites */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Personal website
          </label>
          <input
            type="url"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
            value={fields.website || ""}
            onChange={(e) => handleChange("website", e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            GitHub
          </label>
          <input
            type="url"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
            value={fields.github || ""}
            onChange={(e) => handleChange("github", e.target.value)}
            placeholder="https://github.com/yourusername"
          />
        </div>
      </div>

      {/* Education */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Current degree status
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
            value={fields.current_degree_status || ""}
            onChange={(e) =>
              handleChange("current_degree_status", e.target.value)
            }
            placeholder="e.g. Pursuing Bachelor's, Completed Master's"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Expected graduation
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
            value={fields.expected_graduation || ""}
            onChange={(e) =>
              handleChange("expected_graduation", e.target.value)
            }
            placeholder="e.g. May 2026"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Available start date
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
            value={fields.availability_start_date || ""}
            onChange={(e) =>
              handleChange("availability_start_date", e.target.value)
            }
            placeholder="e.g. June 2026, Immediately"
          />
        </div>
      </div>

      {/* EEO preferences */}
      <details className="group">
        <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
          EEO preferences (optional, voluntary)
        </summary>
        <div className="mt-3 space-y-3 pl-1">
          <p className="text-xs text-gray-400">
            These are used for voluntary Equal Employment Opportunity questions.
            If left blank, we'll select "Decline to answer" automatically.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Gender
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
              value={fields.eeo_gender || ""}
              onChange={(e) => handleChange("eeo_gender", e.target.value)}
              placeholder="e.g. Male, Female, Non-binary, Decline"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Race/Ethnicity
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
              value={fields.eeo_race || ""}
              onChange={(e) => handleChange("eeo_race", e.target.value)}
              placeholder="e.g. Asian, White, Decline"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Veteran status
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
              value={fields.eeo_veteran_status || ""}
              onChange={(e) =>
                handleChange("eeo_veteran_status", e.target.value)
              }
              placeholder="e.g. Not a veteran, Decline"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Disability status
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
              value={fields.eeo_disability_status || ""}
              onChange={(e) =>
                handleChange("eeo_disability_status", e.target.value)
              }
              placeholder="e.g. No, I don't have a disability, Decline"
            />
          </div>
        </div>
      </details>

      {/* Referral default */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          Default referral source
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
          value={fields.referral_source || ""}
          onChange={(e) => handleChange("referral_source", e.target.value)}
          placeholder="e.g. Job Board, Handshake, Campus Event"
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || status === "saving"}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "saving" ? "Saving..." : "Save application preferences"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-green-600">Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">Failed to save</span>
        )}
      </div>
    </div>
  );
}
