import { useCallback, useState } from "react";
import {
  downloadWrittenDocumentPdf,
  putWrittenDocument,
  WrittenDocumentArtifact,
} from "../api";

interface WrittenDocsReviewPanelProps {
  writtenDocs: WrittenDocumentArtifact[];
  pipelineJobId: string;
  pipelineJobStatus: string | undefined;
}

export function WrittenDocsReviewPanel({
  writtenDocs,
  pipelineJobId,
  pipelineJobStatus,
}: WrittenDocsReviewPanelProps) {
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);

  const handleWrittenDocSave = useCallback(
    async (artifactId: string, text: string, instructions: string) => {
      if (!pipelineJobId || !text.trim()) return;
      setSaving(true);

      try {
        await putWrittenDocument(pipelineJobId, text, instructions, artifactId);
      } catch (err) {
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [pipelineJobId],
  );

  const handleWrittenDocDownload = useCallback(
    async (artifactId: string) => {
      if (!pipelineJobId) return;

      try {
        setDownloading(true);
        await downloadWrittenDocumentPdf(pipelineJobId, artifactId);
      } catch (err) {
        console.error(err);
      } finally {
        setDownloading(false);
      }
    },
    [pipelineJobId],
  );

  if (writtenDocs.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Written Document
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            AI-generated response to the employer's prompt. Edit before
            submission.
          </p>
        </div>
      </div>

      <div className="flex-1  gap-2">
        {writtenDocs.map((writtenDoc) => (
          <form
            key={writtenDoc.artifactId}
            className="flex-1 overflow-y-auto p-5 space-y-4"
            onSubmit={handleSubmit(writtenDoc)}
          >
            {writtenDoc.instructions && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Employer Instructions
                </p>
                <p className="text-xs text-amber-700 whitespace-pre-wrap">
                  {writtenDoc.instructions.replace(/\s+/g, " ").trim()}
                </p>
              </div>
            )}
            <textarea
              className="w-full min-h-[400px] px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 leading-relaxed resize-y outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
              defaultValue={writtenDoc.text}
              placeholder="Your response..."
              name="writtenDocText"
            />
            {savingError && <small>{savingError}</small>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload(writtenDoc)}
                disabled={downloading}
                className="disabled:cursor-not-allowed disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                {downloading ? "Downloading..." : "Download PDF"}
              </button>
              <button
                type="submit"
                disabled={saving || pipelineJobStatus !== "awaiting_approval"}
                className="disabled:cursor-not-allowed disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );

  function handleSubmit(writtenDoc: WrittenDocumentArtifact) {
    return async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const writtenDocText = formData.get("writtenDocText") as string;
      if (!writtenDoc.artifactId) {
        setSavingError("Written document artifact ID is required");
        return;
      }
      try {
        setSaving(true);

        await handleWrittenDocSave(
          writtenDoc.artifactId,
          writtenDocText,
          writtenDoc.instructions || "",
        );
        setSaving(false);

        setSavingError(null);
      } catch (err) {
        console.error(err);
        setSavingError(
          err instanceof Error
            ? err.message
            : "Failed to save written document",
        );
      } finally {
        setSaving(false);
      }
    };
  }

  function handleDownload(writtenDoc: WrittenDocumentArtifact) {
    return async () => {
      if (!writtenDoc.artifactId) {
        setSavingError("Written document artifact ID is required");
        return;
      }
      if (saving) return;
      try {
        setDownloading(true);

        await handleWrittenDocDownload(writtenDoc.artifactId);
      } catch (err) {
        console.error(err);
      } finally {
        setDownloading(false);
      }
    };
  }
}
