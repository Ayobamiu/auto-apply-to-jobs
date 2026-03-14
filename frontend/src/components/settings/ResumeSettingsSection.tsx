import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle, Eye } from "lucide-react";
import { getBaseResume, postBaseResumeFile } from "../../api";
import { ResumeEditorApp } from "../../resume-editor/ResumeEditorApp";

type Status = "idle" | "loading" | "uploading" | "error";

export function ResumeSettingsSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [resume, setResume] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getBaseResume();
      setResume(res.resume ?? null);
    } catch {
      setResume(null);
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
      setResume(res.resume ?? null);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }, []);

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

  if (showPreview && resume) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 bg-transparent border-0 cursor-pointer self-start"
        >
          ← Back to upload
        </button>
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
        className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition-colors"
      >
        {status === "uploading" ? (
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
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
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 border-0 cursor-pointer transition-colors"
        >
          <Eye className="w-4 h-4" />
          Preview & edit resume
        </button>
      )}
    </div>
  );
}
