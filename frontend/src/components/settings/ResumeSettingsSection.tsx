import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  Save,
} from "lucide-react";
import { getBaseResume, postBaseResumeFile, putBaseResume } from "../../api";
import { useOnboarding } from "../../hooks/useOnboarding";
import { ResumeEditorApp } from "../../resume-editor/ResumeEditorApp";

type Status = "idle" | "loading" | "uploading" | "error";

export function ResumeSettingsSection() {
  const { refetch: refetchOnboarding } = useOnboarding();
  const [status, setStatus] = useState<Status>("loading");
  const [resume, setResume] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const lastSavedResumeRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getBaseResume();
      const data = res.resume ?? null;
      setResume(data);
      lastSavedResumeRef.current = data ? JSON.stringify(data) : null;
    } catch {
      setResume(null);
      lastSavedResumeRef.current = null;
    } finally {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Please upload a PDF file.");
      return;
    }
    setStatus("uploading");
    setErrorMsg("");
    try {
      const res = await postBaseResumeFile(file);
      const data = res.resume ?? null;
      setResume(data);
      lastSavedResumeRef.current = data ? JSON.stringify(data) : null;
      setStatus("idle");
      void refetchOnboarding();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }, [refetchOnboarding]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const resumeDirty =
    resume &&
    lastSavedResumeRef.current !== null &&
    JSON.stringify(resume) !== lastSavedResumeRef.current;

  const handleSaveBaseResume = useCallback(async () => {
    if (!resume || !resumeDirty || savingResume) return;
    setSavingResume(true);
    try {
      await putBaseResume(resume);
      lastSavedResumeRef.current = JSON.stringify(resume);
      void refetchOnboarding();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingResume(false);
    }
  }, [resume, resumeDirty, savingResume, refetchOnboarding]);

  if (showPreview && resume) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 bg-transparent border-0 cursor-pointer"
          >
            ← Back to upload
          </button>
          {resumeDirty && (
            <button
              type="button"
              onClick={handleSaveBaseResume}
              disabled={savingResume}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60 border-0 cursor-pointer"
            >
              {savingResume ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save changes
            </button>
          )}
        </div>
        <div className="h-[600px] rounded-2xl overflow-hidden border border-gray-100">
          <ResumeEditorApp
            initialResume={resume}
            onSave={(next) => setResume(next)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Upload your base resume as a PDF. We'll use it as the starting point
        when tailoring applications.
      </p>

      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition-colors"
      >
        {status === "uploading" ? (
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        ) : status === "idle" && resume ? (
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        ) : (
          <Upload className="w-8 h-8 text-gray-400" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {status === "uploading"
              ? "Uploading…"
              : resume
                ? "Resume on file — click to replace"
                : "Click to upload or drag & drop"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">PDF only · max 10 MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {resume && (
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 border-0 cursor-pointer transition-colors"
        >
          <Eye className="w-4 h-4" />
          Preview & edit resume
        </button>
      )}
    </div>
  );
}
