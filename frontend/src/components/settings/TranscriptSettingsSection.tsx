import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  Eye,
} from "lucide-react";
import {
  getTranscriptStatus,
  getTranscriptPreviewUrl,
  uploadTranscript,
} from "../../api";

type Status = "loading" | "idle" | "uploading" | "error";

export function TranscriptSettingsSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [hasTranscript, setHasTranscript] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getTranscriptStatus();
      setHasTranscript(res.hasTranscript);
    } catch {
      setHasTranscript(false);
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
    setSuccessMsg("");
    try {
      await uploadTranscript(file);
      setHasTranscript(true);
      setSuccessMsg("Transcript uploaded successfully.");
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

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setErrorMsg("");
    try {
      const { url } = await getTranscriptPreviewUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to open preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Some jobs on Handshake require a transcript. Upload yours here so it's
        ready when needed.
      </p>

      {/* Current status */}
      {status !== "loading" && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            hasTranscript
              ? "bg-emerald-50 border-emerald-100"
              : "bg-amber-50 border-amber-100"
          }`}
        >
          {hasTranscript ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <FileText className="w-5 h-5 text-amber-500 flex-shrink-0" />
          )}
          <div>
            <p
              className={`text-sm font-medium ${hasTranscript ? "text-emerald-800" : "text-amber-800"}`}
            >
              {hasTranscript ? "Transcript on file" : "No transcript uploaded"}
            </p>
            <p
              className={`text-xs mt-0.5 ${hasTranscript ? "text-emerald-600" : "text-amber-600"}`}
            >
              {hasTranscript
                ? "Your transcript will be used automatically for jobs that require it."
                : "Upload your transcript to apply to jobs that require it."}
            </p>
          </div>
          {hasTranscript && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {previewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview
              </button>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {successMsg && !errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <p className="text-sm text-emerald-700">{successMsg}</p>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition-colors"
      >
        {status === "loading" || status === "uploading" ? (
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-gray-400" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {status === "uploading"
              ? "Uploading…"
              : hasTranscript
                ? "Click to replace transcript"
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
    </div>
  );
}
