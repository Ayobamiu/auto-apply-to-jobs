import {
  approvePipelineJob,
  downloadPipelineArtifactPdf,
  putPipelineArtifactCover,
  putPipelineArtifactResume,
  type PipelineArtifacts,
} from './api.js';
import { createResumeForm } from './resume-form.js';
import { createResumePreview } from './resume-preview.js';
import { createCoverLetterEditor } from './cover-letter-editor.js';

export interface ReviewViewOptions {
  jobId: string;
  artifacts: PipelineArtifacts;
  onApproved: () => void;
  onCancelled: () => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function openReviewView(options: ReviewViewOptions): void {
  const { jobId, artifacts, onApproved, onCancelled } = options;

  const existing = document.getElementById('review-view-root');
  if (existing) {
    existing.remove();
  }

  const requiredSections = artifacts.requiredSections ?? ['resume', 'coverLetter'];
  const showResume = requiredSections.includes('resume');
  const showCover = requiredSections.includes('coverLetter');

  const root = document.createElement('div');
  root.id = 'review-view-root';
  root.className = 'review-view-backdrop';
  root.innerHTML = `
    <div class="review-view-shell" role="dialog" aria-modal="true">
      <header class="review-view-header">
        <div>
          <h2 class="review-view-title">Review before we apply</h2>
          <p class="review-view-subtitle">
            Make last-minute tweaks to your resume and cover letter. This is what will be sent for
            <span class="review-view-job-title">${escapeHtml(artifacts.jobTitle || 'this job')}</span>.
          </p>
        </div>
        <button type="button" class="header-btn review-view-close" aria-label="Back to chat">Back to chat</button>
      </header>
      <div class="review-view-body">
        <section class="review-view-edit-pane" aria-label="Edit documents">
          ${showResume ? '<div id="review-view-resume-section" class="review-view-section"></div>' : ''}
          ${showCover ? '<div id="review-view-cover-section" class="review-view-section"></div>' : ''}
        </section>
        <section class="review-view-preview-pane" aria-label="Preview documents">
          <div class="review-view-preview-header">
            <h3 class="review-view-preview-title">What we\'ll send</h3>
            <p class="review-view-preview-hint">This preview uses the same layout as the PDF we generate.</p>
          </div>
          <div id="review-view-resume-preview-container" class="review-view-resume-preview-container"></div>
          ${showCover ? '<div id="review-view-cover-preview-container" class="review-view-cover-preview-container"></div>' : ''}
        </section>
      </div>
      <footer class="review-view-footer">
        <div id="review-view-error" class="review-error" hidden></div>
        <div class="review-view-actions">
          <button type="button" id="review-view-save" class="review-btn">Save changes</button>
          ${showResume ? '<button type="button" id="review-view-download-resume" class="review-btn">Download resume PDF</button>' : ''}
          ${showCover ? '<button type="button" id="review-view-download-cover" class="review-btn">Download cover PDF</button>' : ''}
          <button type="button" id="review-view-approve" class="review-btn review-btn-primary">Looks good – apply</button>
          <button type="button" id="review-view-cancel" class="review-btn">Cancel</button>
        </div>
      </footer>
    </div>
  `;

  document.body.appendChild(root);

  const close = (): void => {
    root.remove();
  };

  const errorEl = document.getElementById('review-view-error') as HTMLElement | null;
  const showError = (msg: string): void => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const clearError = (): void => {
    if (errorEl) errorEl.hidden = true;
  };

  const closeBtn = root.querySelector('.review-view-close') as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      close();
      onCancelled();
    });
  }
  root.addEventListener('click', (e) => {
    if (e.target === root) {
      close();
      onCancelled();
    }
  });

  let resumeFormApi: ReturnType<typeof createResumeForm> | null = null;
  let coverEditorApi: ReturnType<typeof createCoverLetterEditor> | null = null;

  // Resume edit + preview
  if (showResume) {
    const resumeSection = document.getElementById('review-view-resume-section');
    const resumePreviewContainer = document.getElementById('review-view-resume-preview-container');
    if (resumeSection && resumePreviewContainer) {
      resumeSection.innerHTML = `
        <div class="review-view-section-header">
          <div>
            <h3 class="review-view-section-title">Resume</h3>
            <p class="review-view-section-hint">Update your contact info, experience, education, and skills.</p>
          </div>
          <button type="button" class="review-view-ai-btn" disabled title="Coming soon">
            Ask AI to improve (coming soon)
          </button>
        </div>
        <div id="review-view-resume-form-container"></div>
      `;

      const formContainer = document.getElementById('review-view-resume-form-container') as HTMLElement;
      resumeFormApi = createResumeForm(formContainer, artifacts.resume ?? {});

      const resumePreviewApi = createResumePreview(resumePreviewContainer, artifacts.resume ?? null);

      // Debounced live preview based on form input
      let debounceTimer: number | null = null;
      formContainer.addEventListener('input', () => {
        if (!resumeFormApi) return;
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
        }
        debounceTimer = window.setTimeout(() => {
          try {
            const value = resumeFormApi!.getValue();
            resumePreviewApi.setResume(value);
          } catch {
            // ignore preview errors; main error surface is on save/approve
          }
        }, 300);
      });
    }
  }

  // Cover letter edit + preview
  if (showCover) {
    const coverSection = document.getElementById('review-view-cover-section');
    const coverPreviewContainer = document.getElementById('review-view-cover-preview-container');
    if (coverSection && coverPreviewContainer) {
      coverSection.innerHTML = `
        <div class="review-view-section-header">
          <div>
            <h3 class="review-view-section-title">Cover letter</h3>
            <p class="review-view-section-hint">Tweak your cover letter for this job. Keep it concise and specific.</p>
          </div>
          <button type="button" class="review-view-ai-btn" disabled title="Coming soon">
            Tailor with AI (coming soon)
          </button>
        </div>
        <div id="review-view-cover-editor-container"></div>
      `;

      const editorContainer = document.getElementById('review-view-cover-editor-container') as HTMLElement;
      coverEditorApi = createCoverLetterEditor(
        editorContainer,
        artifacts.cover?.text ?? '',
        coverPreviewContainer
      );
    }
  }

  const saveBtn = document.getElementById('review-view-save') as HTMLButtonElement | null;
  const approveBtn = document.getElementById('review-view-approve') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('review-view-cancel') as HTMLButtonElement | null;
  const downloadResumeBtn = document.getElementById('review-view-download-resume') as HTMLButtonElement | null;
  const downloadCoverBtn = document.getElementById('review-view-download-cover') as HTMLButtonElement | null;

  const setBusy = (busy: boolean): void => {
    if (saveBtn) saveBtn.disabled = busy;
    if (approveBtn) approveBtn.disabled = busy;
    if (cancelBtn) cancelBtn.disabled = busy;
  };

  const doSave = async (): Promise<void> => {
    clearError();
    try {
      if (resumeFormApi) {
        const err = resumeFormApi.validate();
        if (err) {
          showError(err);
          return;
        }
        await putPipelineArtifactResume(jobId, resumeFormApi.getValue());
      }
      if (coverEditorApi) {
        const text = coverEditorApi.getValue().trim() || ' ';
        await putPipelineArtifactCover(jobId, text);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
        await doSave();
      } finally {
        setBusy(false);
      }
    });
  }

  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      setBusy(true);
      clearError();
      try {
        await doSave();
        await approvePipelineJob(jobId);
        close();
        onApproved();
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Approve failed.');
      } finally {
        setBusy(false);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      close();
      onCancelled();
    });
  }

  if (downloadResumeBtn) {
    downloadResumeBtn.addEventListener('click', async () => {
      clearError();
      try {
        await downloadPipelineArtifactPdf(jobId, 'resume');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Download failed.');
      }
    });
  }

  if (downloadCoverBtn) {
    downloadCoverBtn.addEventListener('click', async () => {
      clearError();
      try {
        await downloadPipelineArtifactPdf(jobId, 'cover');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Download failed.');
      }
    });
  }
}

