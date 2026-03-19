import { useCallback, useEffect, useRef, useState } from "react";
import {
  approvePipelineJob,
  downloadPipelineArtifactPdf,
  putPipelineArtifactCover,
  putPipelineArtifactResume,
  putApplicationFormAnswers,
  postApplicationFormReview,
  type PipelineArtifacts,
  type GeneratedAnswer,
} from "../api";
import { createResumeForm } from "../resume-form";
import { createResumePreview } from "../resume-preview";
import { createCoverLetterEditor } from "../cover-letter-editor";
import { FormReviewPanel } from "./FormReviewPanel";

interface ReviewViewProps {
  jobId: string;
  artifacts: PipelineArtifacts;
  /** jobRef (site::jobId) for dynamic form API calls. */
  jobRef?: string;
  onApproved: () => void;
  onCancelled: () => void;
  /** When true, show only preview(s) + Close; no edit UI or Approve/Save. */
  previewOnly?: boolean;
}

export function ReviewView({
  jobId,
  artifacts,
  jobRef,
  onApproved,
  onCancelled,
  previewOnly = false,
}: ReviewViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formAnswers, setFormAnswers] = useState<GeneratedAnswer[]>(
    artifacts.dynamicForm?.answers ?? [],
  );
  const hasDynamicForm = !!artifacts.hasDynamicForm && !!artifacts.dynamicForm;
  const [activeTab, setActiveTab] = useState<"documents" | "form">(
    hasDynamicForm ? "form" : "documents",
  );
  const resumeFormRef = useRef<ReturnType<typeof createResumeForm> | null>(
    null,
  );
  const resumePreviewRef = useRef<ReturnType<
    typeof createResumePreview
  > | null>(null);
  const coverEditorRef = useRef<ReturnType<
    typeof createCoverLetterEditor
  > | null>(null);
  const resumeFormContainerRef = useRef<HTMLDivElement>(null);
  const resumePreviewContainerRef = useRef<HTMLDivElement>(null);
  const coverEditorContainerRef = useRef<HTMLDivElement>(null);
  const coverPreviewContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const requiredSections = artifacts.requiredSections ?? [
    "resume",
    "coverLetter",
  ];
  const showResume = requiredSections.includes("resume");
  const showCover = requiredSections.includes("coverLetter");

  const close = useCallback(() => {
    onCancelled();
  }, [onCancelled]);

  const doSave = useCallback(async () => {
    setError(null);
    try {
      if (resumeFormRef.current) {
        const err = resumeFormRef.current.validate();
        if (err) {
          setError(err);
          return;
        }
        await putPipelineArtifactResume(
          jobId,
          resumeFormRef.current.getValue(),
        );
      }
      if (coverEditorRef.current) {
        const text = coverEditorRef.current.getValue().trim() || " ";
        await putPipelineArtifactCover(jobId, text);
      }
      if (hasDynamicForm && jobRef && formAnswers.length > 0) {
        await putApplicationFormAnswers(jobRef, formAnswers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }, [jobId, hasDynamicForm, jobRef, formAnswers]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await doSave();
    } finally {
      setBusy(false);
    }
  }, [doSave]);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await doSave();
      if (hasDynamicForm && jobRef) {
        await postApplicationFormReview(jobRef, formAnswers);
      }
      await approvePipelineJob(jobId);
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setBusy(false);
    }
  }, [jobId, doSave, onApproved, hasDynamicForm, jobRef, formAnswers]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close();
    },
    [close],
  );

  // Mount imperative resume form and preview (or preview only when previewOnly)
  useEffect(() => {
    if (!showResume || !resumePreviewContainerRef.current) return;
    resumePreviewRef.current = createResumePreview(
      resumePreviewContainerRef.current,
      artifacts.resume ?? null,
    );
    if (!previewOnly && resumeFormContainerRef.current) {
      resumeFormRef.current = createResumeForm(
        resumeFormContainerRef.current,
        artifacts.resume ?? {},
      );
    }
    return () => {
      resumeFormRef.current = null;
      resumePreviewRef.current = null;
    };
  }, [showResume, jobId, artifacts.resume, previewOnly]);

  // Debounced resume form input -> preview
  useEffect(() => {
    if (!showResume || !resumeFormContainerRef.current) return;
    const container = resumeFormContainerRef.current;
    const onInput = () => {
      if (debounceTimerRef.current !== null)
        window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        try {
          if (resumeFormRef.current && resumePreviewRef.current) {
            resumePreviewRef.current.setResume(
              resumeFormRef.current.getValue(),
            );
          }
        } catch {
          // ignore
        }
      }, 300);
    };
    container.addEventListener("input", onInput);
    return () => {
      container.removeEventListener("input", onInput);
      if (debounceTimerRef.current !== null)
        window.clearTimeout(debounceTimerRef.current);
    };
  }, [showResume, previewOnly]);

  // Mount cover letter editor (or set cover preview content when previewOnly)
  useEffect(() => {
    if (!showCover) return;
    if (previewOnly && coverPreviewContainerRef.current) {
      coverPreviewContainerRef.current.textContent =
        artifacts.cover?.text ?? "";
      return;
    }
    if (!coverEditorContainerRef.current || !coverPreviewContainerRef.current)
      return;
    coverEditorRef.current = createCoverLetterEditor(
      coverEditorContainerRef.current,
      artifacts.cover?.text ?? "",
      coverPreviewContainerRef.current,
    );
    return () => {
      coverEditorRef.current = null;
    };
  }, [showCover, jobId, artifacts.cover?.text, previewOnly]);

  return (
    <div className="bg-card border border-border rounded-xl max-w-[1120px] w-full max-h-full flex flex-col">
      <header className="flex items-center justify-between gap-3 py-4 px-5 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-text">
            {previewOnly ? "Preview documents" : "Review before we apply"}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {previewOnly
              ? "Resume and cover letter generated for this job."
              : `Make last-minute tweaks to your resume and cover letter. This is what will be sent for ${artifacts.jobTitle || "this job"}.`}
          </p>
        </div>
        <button
          type="button"
          className="py-1.5 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
          aria-label={previewOnly ? "Close" : "Back to chat"}
          onClick={close}
        >
          {previewOnly ? "Close" : "Back to chat"}
        </button>
      </header>
      {/* Tab bar when dynamic form fields exist */}
      {hasDynamicForm && !previewOnly && (
        <div className="flex border-b border-border px-5">
          <button
            type="button"
            className={`py-2 px-4 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === "form"
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("form")}
          >
            Application form
            {artifacts.dynamicForm && (
              <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                {artifacts.dynamicForm.answers.filter(
                  (a) => a.requiresReview && a.value,
                ).length || ""}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`py-2 px-4 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === "documents"
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("documents")}
          >
            Documents
          </button>
        </div>
      )}

      {/* Form review tab */}
      {hasDynamicForm &&
        activeTab === "form" &&
        !previewOnly &&
        artifacts.dynamicForm && (
          <div className="flex-1 overflow-y-auto py-4 px-5">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-text">
                Review prefilled answers
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                These answers were auto-generated from your profile. Review and
                edit before submission.
              </p>
            </div>
            <FormReviewPanel
              fields={artifacts.dynamicForm.classifiedFields}
              answers={formAnswers}
              onChange={setFormAnswers}
            />
          </div>
        )}

      {/* Documents tab (existing layout) */}
      <div
        className={`flex-1 grid gap-4 py-4 px-5 min-h-0 ${previewOnly ? "grid-cols-1" : "grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)]"} ${
          hasDynamicForm && activeTab !== "documents" && !previewOnly
            ? "hidden"
            : ""
        }`}
      >
        {!previewOnly && (
          <section
            className="flex flex-col gap-4 overflow-y-auto pr-1"
            aria-label="Edit documents"
          >
            {showResume && (
              <div className="rounded-lg border border-border p-3 bg-page">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-text">Resume</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      Update your contact info, experience, education, and
                      skills.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="py-1 px-2.5 rounded-full border border-dashed border-border bg-transparent text-text-muted text-[11px] cursor-default"
                    disabled
                    title="Coming soon"
                  >
                    Ask AI to improve (coming soon)
                  </button>
                </div>
                <div ref={resumeFormContainerRef} />
              </div>
            )}
            {showCover && (
              <div className="rounded-lg border border-border p-3 bg-page">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-text">
                      Cover letter
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      Tweak your cover letter for this job. Keep it concise and
                      specific.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="py-1 px-2.5 rounded-full border border-dashed border-border bg-transparent text-text-muted text-[11px] cursor-default"
                    disabled
                    title="Coming soon"
                  >
                    Tailor with AI (coming soon)
                  </button>
                </div>
                <div ref={coverEditorContainerRef} />
              </div>
            )}
          </section>
        )}
        <section
          className={`flex flex-col gap-3 overflow-y-auto ${previewOnly ? "" : "pl-1"}`}
          aria-label="Preview documents"
        >
          <div className="mb-1">
            <h3 className="text-sm font-medium text-text">
              What we&apos;ll send
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              This preview uses the same layout as the PDF we generate.
            </p>
          </div>
          <div
            ref={resumePreviewContainerRef}
            className="rounded-lg border border-border bg-[#0b0d13] p-2"
          />
          {showCover && (
            <div
              ref={coverPreviewContainerRef}
              className="rounded-lg border border-border bg-[#0b0d13] p-2 mt-2 text-[13px] leading-normal text-text-muted whitespace-pre-wrap break-words"
            />
          )}
        </section>
      </div>
      <footer className="py-2.5 px-5 pb-3.5 border-t border-border flex items-center justify-between gap-3">
        {!previewOnly && error && (
          <div className="text-xs text-danger">{error}</div>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          {previewOnly ? (
            <button
              type="button"
              className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
              onClick={close}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border disabled:opacity-60"
                onClick={handleSave}
                disabled={busy}
              >
                Save changes
              </button>
              {showResume && (
                <button
                  type="button"
                  className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border disabled:opacity-60"
                  onClick={async () => {
                    setError(null);
                    try {
                      await downloadPipelineArtifactPdf(jobId, "resume");
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Download failed.",
                      );
                    }
                  }}
                  disabled={busy}
                >
                  Download resume PDF
                </button>
              )}
              {showCover && (
                <button
                  type="button"
                  className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border disabled:opacity-60"
                  onClick={async () => {
                    setError(null);
                    try {
                      await downloadPipelineArtifactPdf(jobId, "cover");
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Download failed.",
                      );
                    }
                  }}
                  disabled={busy}
                >
                  Download cover PDF
                </button>
              )}
              <button
                type="button"
                className="py-2 px-3.5 bg-accent border border-accent rounded-lg text-on-primary text-[13px] cursor-pointer hover:bg-accent-hover hover:border-accent-hover disabled:opacity-60"
                onClick={handleApprove}
                disabled={busy}
              >
                Looks good – apply
              </button>
              <button
                type="button"
                className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border disabled:opacity-60"
                onClick={close}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
