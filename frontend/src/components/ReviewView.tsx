import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approvePipelineJob,
  downloadPipelineArtifactPdf,
  putPipelineArtifactCover,
  putPipelineArtifactResume,
  type PipelineArtifacts,
} from '../api';
import { createResumeForm } from '../resume-form';
import { createResumePreview } from '../resume-preview';
import { createCoverLetterEditor } from '../cover-letter-editor';

interface ReviewViewProps {
  jobId: string;
  artifacts: PipelineArtifacts;
  onApproved: () => void;
  onCancelled: () => void;
}

export function ReviewView({ jobId, artifacts, onApproved, onCancelled }: ReviewViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resumeFormRef = useRef<ReturnType<typeof createResumeForm> | null>(null);
  const resumePreviewRef = useRef<ReturnType<typeof createResumePreview> | null>(null);
  const coverEditorRef = useRef<ReturnType<typeof createCoverLetterEditor> | null>(null);
  const resumeFormContainerRef = useRef<HTMLDivElement>(null);
  const resumePreviewContainerRef = useRef<HTMLDivElement>(null);
  const coverEditorContainerRef = useRef<HTMLDivElement>(null);
  const coverPreviewContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const requiredSections = artifacts.requiredSections ?? ['resume', 'coverLetter'];
  const showResume = requiredSections.includes('resume');
  const showCover = requiredSections.includes('coverLetter');

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
        await putPipelineArtifactResume(jobId, resumeFormRef.current.getValue());
      }
      if (coverEditorRef.current) {
        const text = coverEditorRef.current.getValue().trim() || ' ';
        await putPipelineArtifactCover(jobId, text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  }, [jobId]);

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
      await approvePipelineJob(jobId);
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusy(false);
    }
  }, [jobId, doSave, onApproved]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close();
    },
    [close]
  );

  // Mount imperative resume form and preview
  useEffect(() => {
    if (!showResume || !resumeFormContainerRef.current || !resumePreviewContainerRef.current)
      return;
    resumeFormRef.current = createResumeForm(
      resumeFormContainerRef.current,
      artifacts.resume ?? {}
    );
    resumePreviewRef.current = createResumePreview(
      resumePreviewContainerRef.current,
      artifacts.resume ?? null
    );
    return () => {
      resumeFormRef.current = null;
      resumePreviewRef.current = null;
    };
  }, [showResume, jobId, artifacts.resume]);

  // Debounced resume form input -> preview
  useEffect(() => {
    if (!showResume || !resumeFormContainerRef.current) return;
    const container = resumeFormContainerRef.current;
    const onInput = () => {
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        try {
          if (resumeFormRef.current && resumePreviewRef.current) {
            resumePreviewRef.current.setResume(resumeFormRef.current.getValue());
          }
        } catch {
          // ignore
        }
      }, 300);
    };
    container.addEventListener('input', onInput);
    return () => {
      container.removeEventListener('input', onInput);
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    };
  }, [showResume]);

  // Mount cover letter editor
  useEffect(() => {
    if (
      !showCover ||
      !coverEditorContainerRef.current ||
      !coverPreviewContainerRef.current
    )
      return;
    coverEditorRef.current = createCoverLetterEditor(
      coverEditorContainerRef.current,
      artifacts.cover?.text ?? '',
      coverPreviewContainerRef.current
    );
    return () => {
      coverEditorRef.current = null;
    };
  }, [showCover, jobId, artifacts.cover?.text]);

  return (
    <div
      id="review-view-root"
      className="review-view-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className="review-view-shell">
        <header className="review-view-header">
          <div>
            <h2 className="review-view-title">Review before we apply</h2>
            <p className="review-view-subtitle">
              Make last-minute tweaks to your resume and cover letter. This is what will be sent
              for <span className="review-view-job-title">{artifacts.jobTitle || 'this job'}</span>.
            </p>
          </div>
          <button
            type="button"
            className="header-btn review-view-close"
            aria-label="Back to chat"
            onClick={close}
          >
            Back to chat
          </button>
        </header>
        <div className="review-view-body">
          <section className="review-view-edit-pane" aria-label="Edit documents">
            {showResume && (
              <div className="review-view-section">
                <div className="review-view-section-header">
                  <div>
                    <h3 className="review-view-section-title">Resume</h3>
                    <p className="review-view-section-hint">
                      Update your contact info, experience, education, and skills.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="review-view-ai-btn"
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
              <div className="review-view-section">
                <div className="review-view-section-header">
                  <div>
                    <h3 className="review-view-section-title">Cover letter</h3>
                    <p className="review-view-section-hint">
                      Tweak your cover letter for this job. Keep it concise and specific.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="review-view-ai-btn"
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
          <section className="review-view-preview-pane" aria-label="Preview documents">
            <div className="review-view-preview-header">
              <h3 className="review-view-preview-title">What we&apos;ll send</h3>
              <p className="review-view-preview-hint">
                This preview uses the same layout as the PDF we generate.
              </p>
            </div>
            <div
              ref={resumePreviewContainerRef}
              className="review-view-resume-preview-container"
            />
            {showCover && (
              <div
                ref={coverPreviewContainerRef}
                className="review-view-cover-preview-container"
              />
            )}
          </section>
        </div>
        <footer className="review-view-footer">
          {error && <div className="review-error">{error}</div>}
          <div className="review-view-actions">
            <button
              type="button"
              className="review-btn"
              onClick={handleSave}
              disabled={busy}
            >
              Save changes
            </button>
            {showResume && (
              <button
                type="button"
                className="review-btn"
                onClick={async () => {
                  setError(null);
                  try {
                    await downloadPipelineArtifactPdf(jobId, 'resume');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Download failed.');
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
                className="review-btn"
                onClick={async () => {
                  setError(null);
                  try {
                    await downloadPipelineArtifactPdf(jobId, 'cover');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Download failed.');
                  }
                }}
                disabled={busy}
              >
                Download cover PDF
              </button>
            )}
            <button
              type="button"
              className="review-btn review-btn-primary"
              onClick={handleApprove}
              disabled={busy}
            >
              Looks good – apply
            </button>
            <button
              type="button"
              className="review-btn"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
