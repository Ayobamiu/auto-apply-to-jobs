import {
  sendChat,
  getChatMessages,
  getPipelineJobStatus,
  getPipelineArtifacts,
  putPipelineArtifactResume,
  putPipelineArtifactCover,
  approvePipelineJob,
  cancelPipelineJob,
  downloadPipelineArtifactPdf,
  downloadAppliedArtifactPdf,
  getHandshakeSessionStatus,
  getSettings,
  putSettings,
  getProfile,
  getTranscriptStatus,
  uploadResumePdf,
  uploadTranscript,
  getBaseResume,
  postBaseResumeFile,
  postBaseResumeText,
  putBaseResume,
  type ChatMessage,
  type PipelineArtifacts,
  type AppliedArtifacts,
  type AutomationLevel,
} from './api.js';
import { createResumeForm } from './resume-form.js';
import { openReviewView } from './review-view.js';
import { renderResumeToHtml } from './resume-preview.js';

const MAX_MESSAGES_TO_BACKEND = 50;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function renderChat(
  container: HTMLElement,
  onLogout: () => void
): void {
  const messages: ChatMessage[] = [];
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollAttempts = 0;
  let currentPollJobId: string | null = null;
  let reviewCardJobId: string | null = null;
  let reviewCardContainer: HTMLElement | null = null;
  let appliedCardContainer: HTMLElement | null = null;
  let appliedCardJobId: string | null = null;

  const token = localStorage.getItem('token') ?? '';

  container.innerHTML = `
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
          <label class="header-label">Automation: <select id="automation-level" class="header-select" title="Review: pause to edit before apply. Full: apply automatically.">
            <option value="review">Review before apply</option>
            <option value="full">Full auto</option>
          </select></label>
          <div class="header-menu-wrap">
            <button type="button" id="menu-btn" class="header-btn" aria-haspopup="true" aria-expanded="false">Menu</button>
            <div id="header-menu" class="header-menu" hidden>
              <button type="button" class="menu-item" data-action="preview-profile">Preview profile</button>
              <button type="button" class="menu-item" data-action="preview-resume">Preview resume</button>
              <button type="button" class="menu-item" data-action="preview-transcript">Preview transcript</button>
              <div class="menu-divider"></div>
              <button type="button" class="menu-item" data-action="upload-resume-pdf">Upload resume PDF</button>
              <input type="file" id="upload-resume-pdf-input" accept=".pdf,application/pdf" hidden />
              <button type="button" class="menu-item" data-action="upload-transcript">Upload transcript</button>
              <input type="file" id="upload-transcript-input" accept=".pdf,application/pdf" hidden />
              <button type="button" class="menu-item" data-action="base-resume">Base resume</button>
              <button type="button" class="menu-item" data-action="check-connection">Check connection</button>
              <button type="button" class="menu-item" data-action="copy-token">Copy Token</button>
              <div class="menu-divider"></div>
              <button type="button" class="menu-item menu-item-secondary" data-action="logout">Sign Out</button>
            </div>
          </div>
        </div>
      </header>

      <main id="chat-messages" class="chat-messages"></main>

      <footer class="chat-footer">
        <form id="chat-form" class="chat-form">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Type a message... (paste resume, send a job URL, or ask for help)"
            rows="2"
          ></textarea>
          <button type="submit" id="chat-send" class="chat-send-btn">Send</button>
        </form>
      </footer>

      <div id="base-resume-modal" class="base-resume-modal" hidden>
        <div class="base-resume-modal-content">
          <div class="base-resume-modal-header">
            <h2>Base resume</h2>
            <button type="button" id="base-resume-modal-close" class="header-btn">Close</button>
          </div>
          <div class="base-resume-upload">
            <p class="base-resume-hint">Upload a PDF or paste text to set your base resume. It will be tailored per job.</p>
            <div class="base-resume-upload-row">
              <input type="file" id="base-resume-file" accept=".pdf,application/pdf" />
              <button type="button" id="base-resume-upload-pdf" class="review-btn">Upload PDF</button>
            </div>
            <div class="base-resume-upload-row">
              <textarea id="base-resume-paste" class="review-textarea" rows="6" placeholder="Or paste resume text here..."></textarea>
              <button type="button" id="base-resume-save-text" class="review-btn">Save from text</button>
            </div>
            <div id="base-resume-upload-error" class="review-error" hidden></div>
          </div>
          <div class="base-resume-edit">
            <button type="button" id="base-resume-load-edit" class="review-btn">Load and edit</button>
            <button type="button" id="base-resume-save-edits" class="review-btn" hidden>Save edits</button>
            <div id="base-resume-form-container" class="base-resume-form-wrap" hidden></div>
            <div id="base-resume-edit-error" class="review-error" hidden></div>
          </div>
        </div>
      </div>

      <div id="preview-modal" class="base-resume-modal" hidden>
        <div class="base-resume-modal-content preview-modal-content">
          <div class="base-resume-modal-header">
            <h2 id="preview-modal-title">Preview</h2>
            <button type="button" id="preview-modal-close" class="header-btn">Close</button>
          </div>
          <div id="preview-modal-body" class="preview-modal-body"></div>
        </div>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById('chat-messages')!;
  const form = document.getElementById('chat-form') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('chat-send') as HTMLButtonElement;
  const automationSelect = document.getElementById('automation-level') as HTMLSelectElement;
  const menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;
  const headerMenu = document.getElementById('header-menu') as HTMLElement;
  const uploadResumePdfInput = document.getElementById('upload-resume-pdf-input') as HTMLInputElement;
  const uploadTranscriptInput = document.getElementById('upload-transcript-input') as HTMLInputElement;
  const previewModal = document.getElementById('preview-modal') as HTMLElement;
  const previewModalClose = document.getElementById('preview-modal-close') as HTMLButtonElement;
  const previewModalTitle = document.getElementById('preview-modal-title') as HTMLElement;
  const previewModalBody = document.getElementById('preview-modal-body') as HTMLElement;
  const logoutBtn = document.querySelector('[data-action="logout"]') as HTMLButtonElement;
  const baseResumeModal = document.getElementById('base-resume-modal') as HTMLElement;
  const baseResumeModalClose = document.getElementById('base-resume-modal-close') as HTMLButtonElement;
  const baseResumeFile = document.getElementById('base-resume-file') as HTMLInputElement;
  const baseResumeUploadPdfBtn = document.getElementById('base-resume-upload-pdf') as HTMLButtonElement;
  const baseResumePaste = document.getElementById('base-resume-paste') as HTMLTextAreaElement;
  const baseResumeSaveTextBtn = document.getElementById('base-resume-save-text') as HTMLButtonElement;
  const baseResumeUploadError = document.getElementById('base-resume-upload-error') as HTMLElement;
  const baseResumeLoadEditBtn = document.getElementById('base-resume-load-edit') as HTMLButtonElement;
  const baseResumeSaveEditsBtn = document.getElementById('base-resume-save-edits') as HTMLButtonElement;
  const baseResumeFormContainer = document.getElementById('base-resume-form-container') as HTMLElement;
  const baseResumeEditError = document.getElementById('base-resume-edit-error') as HTMLElement;
  let baseResumeFormApi: ReturnType<typeof createResumeForm> | null = null;

  getSettings()
    .then((s) => {
      automationSelect.value = s.automationLevel;
    })
    .catch(() => {});

  automationSelect.addEventListener('change', () => {
    const value = automationSelect.value as AutomationLevel;
    putSettings({ automationLevel: value }).catch(() => {
      automationSelect.value = value === 'full' ? 'review' : 'full';
    });
  });

  function scrollToBottom(): void {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeReviewCard(): void {
    reviewCardContainer?.remove();
    reviewCardContainer = null;
    reviewCardJobId = null;
  }

  function removeAppliedCard(): void {
    appliedCardContainer?.remove();
    appliedCardContainer = null;
    appliedCardJobId = null;
  }

  function renderAppliedCard(jobId: string, applied: AppliedArtifacts, jobTitle: string): void {
    if (appliedCardJobId === jobId) return;
    removeAppliedCard();
    appliedCardJobId = jobId;
    const hasResume = applied.resume && typeof applied.resume === 'object';
    const hasCover = applied.coverLetter?.text;
    const container = document.createElement('div');
    container.id = 'applied-card-container';
    container.className = 'chat-bubble chat-bubble-assistant review-card applied-artifacts-card';
    const resumeSummary = hasResume
      ? (() => {
          const b = (applied.resume as Record<string, unknown>).basics as Record<string, unknown> | undefined;
          const name = b?.name ?? '';
          const label = b?.label ?? '';
          const work = (applied.resume as Record<string, unknown>).work as unknown[] | undefined;
          const n = Array.isArray(work) ? work.length : 0;
          return `${name}${label ? ` · ${label}` : ''}${n ? ` · ${n} experience(s)` : ''}`;
        })()
      : '';
    const coverPreview = hasCover
      ? (applied.coverLetter!.text.slice(0, 200) + (applied.coverLetter!.text.length > 200 ? '…' : ''))
      : '';
    container.innerHTML = `
      <div class="chat-bubble-content">
        <div class="review-card-header">
          <strong>Applied with these documents</strong>
          <div class="review-job-title">${escapeHtml(jobTitle)}</div>
        </div>
        ${hasResume ? `<div class="applied-section"><div class="applied-summary">${escapeHtml(resumeSummary)}</div><button type="button" class="review-btn applied-download-resume">Download resume PDF</button></div>` : ''}
        ${hasCover ? `<div class="applied-section"><div class="applied-cover-preview">${escapeHtml(coverPreview)}</div><button type="button" class="review-btn applied-download-cover">Download cover PDF</button></div>` : ''}
      </div>
    `;
    appliedCardContainer = container;
    messagesEl.appendChild(container);
    scrollToBottom();
    container.querySelector('.applied-download-resume')?.addEventListener('click', () => {
      downloadAppliedArtifactPdf(jobId, 'resume').catch((err) => addMessage('assistant', err instanceof Error ? err.message : 'Download failed.'));
    });
    container.querySelector('.applied-download-cover')?.addEventListener('click', () => {
      downloadAppliedArtifactPdf(jobId, 'cover').catch((err) => addMessage('assistant', err instanceof Error ? err.message : 'Download failed.'));
    });
  }

  function renderReviewCard(jobId: string, artifacts: PipelineArtifacts): void {
    if (reviewCardJobId === jobId) return;
    removeReviewCard();
    reviewCardJobId = jobId;

    const container = document.createElement('div');
    container.id = 'review-card-container';
    container.className = 'chat-bubble chat-bubble-assistant review-card';

    const card = document.createElement('div');
    card.className = 'chat-bubble-content';
    card.innerHTML = `
      <div class="review-card-header">
        <strong>Review before apply</strong>
        <div class="review-job-title">${escapeHtml(artifacts.jobTitle)}</div>
      </div>
      <p class="review-card-hint">We\'ve drafted a tailored resume${artifacts.cover?.text ? ' and cover letter' : ''}. You can open a full-page editor to make changes before we submit.</p>
      <div class="review-actions">
        <button type="button" id="review-open-detailed" class="review-btn review-btn-primary">Open detailed review</button>
        <button type="button" id="review-download-resume" class="review-btn">Download resume PDF</button>
        ${artifacts.cover?.text ? '<button type="button" id="review-download-cover" class="review-btn">Download cover PDF</button>' : ''}
        <button type="button" id="review-cancel" class="review-btn">Cancel</button>
      </div>
      <div id="review-action-error" class="review-error" hidden></div>
    `;

    container.appendChild(card);
    reviewCardContainer = container;
    messagesEl.appendChild(container);
    scrollToBottom();

    const actionError = document.getElementById('review-action-error') as HTMLElement | null;
    const showActionError = (msg: string): void => {
      if (!actionError) return;
      actionError.textContent = msg;
      actionError.hidden = false;
    };

    document.getElementById('review-open-detailed')!.addEventListener('click', () => {
      openReviewView({
        jobId,
        artifacts,
        onApproved: () => {
          removeReviewCard();
          if (currentPollJobId) startPolling(currentPollJobId);
        },
        onCancelled: () => {
          // Keep the summary card so user can still open review later if job is awaiting approval
        },
      });
    });

    const downloadResumeBtn = document.getElementById('review-download-resume');
    if (downloadResumeBtn) {
      downloadResumeBtn.addEventListener('click', async () => {
        try {
          await downloadPipelineArtifactPdf(jobId, 'resume');
        } catch (err) {
          showActionError(err instanceof Error ? err.message : 'Download failed.');
        }
      });
    }
    const downloadCoverBtn = document.getElementById('review-download-cover');
    if (downloadCoverBtn) {
      downloadCoverBtn.addEventListener('click', async () => {
        try {
          await downloadPipelineArtifactPdf(jobId, 'cover');
        } catch (err) {
          showActionError(err instanceof Error ? err.message : 'Download failed.');
        }
      });
    }

    document.getElementById('review-cancel')!.addEventListener('click', () => {
      removeReviewCard();
      addMessage('assistant', 'No problem. You can download the resume and cover letter to apply manually.');
    });
  }

  function renderMessages(): void {
    reviewCardContainer?.remove();
    appliedCardContainer?.remove();
    messagesEl.innerHTML = messages
      .map(
        (m) =>
          `<div class="chat-bubble chat-bubble-${m.role}">
            <div class="chat-bubble-content">${formatMessage(m.content)}</div>
            ${m.timestamp ? `<span class="chat-bubble-time">${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
          </div>`
      )
      .join('');
    if (reviewCardContainer) messagesEl.appendChild(reviewCardContainer);
    if (appliedCardContainer) messagesEl.appendChild(appliedCardContainer);
    scrollToBottom();
  }

  function addMessage(role: 'user' | 'assistant', content: string): void {
    messages.push({ role, content, timestamp: new Date().toISOString() });
    renderMessages();
  }

  function showTypingIndicator(phase?: string | null, cancelOpts?: { jobId: string; onCancel: () => void }): void {
    const existing = document.getElementById('typing-indicator');
    if (existing) {
      const content = existing.querySelector('.chat-bubble-content');
      if (content) {
        let html = phase
          ? `<span class="chat-phase">${escapeHtml(phase)}</span>`
          : '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        if (cancelOpts) {
          html += ` <button type="button" class="chat-cancel-btn" data-job-id="${escapeHtml(cancelOpts.jobId)}">Cancel application</button>`;
        }
        content.innerHTML = html;
        const btn = content.querySelector('.chat-cancel-btn');
        if (btn && cancelOpts) btn.addEventListener('click', cancelOpts.onCancel);
      }
      scrollToBottom();
      return;
    }
    const indicator = document.createElement('div');
    indicator.className = 'chat-bubble chat-bubble-assistant chat-typing';
    indicator.id = 'typing-indicator';
    let inner = phase
      ? `<span class="chat-phase">${escapeHtml(phase)}</span>`
      : '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    if (cancelOpts) {
      inner += ` <button type="button" class="chat-cancel-btn" data-job-id="${escapeHtml(cancelOpts.jobId)}">Cancel application</button>`;
    }
    indicator.innerHTML = `<div class="chat-bubble-content">${inner}</div>`;
    const btn = indicator.querySelector('.chat-cancel-btn');
    if (btn && cancelOpts) btn.addEventListener('click', cancelOpts.onCancel);
    messagesEl.appendChild(indicator);
    scrollToBottom();
  }

  function hideTypingIndicator(): void {
    document.getElementById('typing-indicator')?.remove();
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    currentPollJobId = null;
    pollAttempts = 0;
  }

  function startPolling(jobId: string): void {
    stopPolling();
    currentPollJobId = jobId;
    pollAttempts = 0;
    const cancelOpts = {
      jobId,
      onCancel: () => {
        cancelPipelineJob(jobId)
          .then((r) => {
            if (r.cancelled) {
              hideTypingIndicator();
              addMessage('assistant', 'Application cancelled.');
              stopPolling();
            }
          })
          .catch(() => {
            addMessage('assistant', 'Could not cancel. You can try again or ask "check status".');
          });
      },
    };
    showTypingIndicator('Starting...', cancelOpts);

    function poll(): void {
      if (!currentPollJobId || pollAttempts >= MAX_POLL_ATTEMPTS) {
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          addMessage('assistant', 'I\'ve been checking for a while. You can ask "check status" anytime to get an update.');
        }
        hideTypingIndicator();
        stopPolling();
        return;
      }
      pollAttempts++;

      getPipelineJobStatus(currentPollJobId)
        .then((job) => {
          if (job.status === 'awaiting_approval') {
            hideTypingIndicator();
            getPipelineArtifacts(currentPollJobId!)
              .then((artifacts) => renderReviewCard(currentPollJobId!, artifacts))
              .catch(() => addMessage('assistant', 'Could not load artifacts for review.'));
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }
          if (job.status === 'done') {
            hideTypingIndicator();
            removeReviewCard();
            const msg =
              job.userMessage ??
              (job.error ? `Failed: ${job.error}` : 'Pipeline completed.');
            addMessage('assistant', msg);
            const applied = job.result?.appliedArtifacts;
            const jobTitle = (job.result && typeof job.result === 'object' && (job.result as Record<string, unknown>).job && typeof (job.result as Record<string, unknown>).job === 'object')
              ? String(((job.result as Record<string, unknown>).job as Record<string, unknown>).title ?? '')
              : '';
            if (applied && (applied.resume || applied.coverLetter?.text)) {
              renderAppliedCard(currentPollJobId!, applied, jobTitle || 'Job');
            }
            stopPolling();
            return;
          }
          if (job.status === 'failed') {
            hideTypingIndicator();
            removeReviewCard();
            addMessage('assistant', `Failed: ${job.error ?? 'Unknown error'}`);
            stopPolling();
            return;
          }
          if (job.status === 'cancelled') {
            hideTypingIndicator();
            removeReviewCard();
            addMessage('assistant', 'That application was cancelled.');
            stopPolling();
            return;
          }
          const jobIdForCancel = currentPollJobId!;
          showTypingIndicator(job.phase ?? 'Processing...', {
            jobId: jobIdForCancel,
            onCancel: () => {
              cancelPipelineJob(jobIdForCancel)
                .then((r) => {
                  if (r.cancelled) {
                    hideTypingIndicator();
                    addMessage('assistant', "Application cancelled.");
                    stopPolling();
                  }
                })
                .catch(() => {
                  addMessage('assistant', 'Could not cancel. You can try again or ask "check status".');
                });
            },
          });
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        })
        .catch(() => {
          hideTypingIndicator();
          stopPolling();
        });
    }

    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function handleSend(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    showTypingIndicator();

    try {
      const historySlice = messages.slice(-MAX_MESSAGES_TO_BACKEND);
      const res = await sendChat(text, historySlice);
      hideTypingIndicator();
      addMessage('assistant', res.reply);

      if (res.meta?.pollStatus && res.meta.jobId) {
        startPolling(res.meta.jobId);
      }
    } catch (err) {
      hideTypingIndicator();
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      addMessage('assistant', `Error: ${msg}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleSend();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  });

  const previewModalContent = previewModal.querySelector('.preview-modal-content');

  function showPreviewModal(title: string, body: string): void {
    previewModalTitle.textContent = title;
    previewModalContent?.classList.remove('preview-modal-content--resume');
    previewModalBody.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'preview-modal-text';
    pre.textContent = body;
    previewModalBody.appendChild(pre);
    previewModal.hidden = false;
  }

  function showResumePreviewModal(title: string, resume: Record<string, unknown> | null): void {
    previewModalTitle.textContent = title;
    previewModalContent?.classList.add('preview-modal-content--resume');
    previewModalBody.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.className = 'preview-modal-iframe';
    frame.setAttribute('title', title);
    previewModalBody.appendChild(frame);
    const doc = frame.contentDocument;
    if (doc) {
      doc.open();
      doc.write(renderResumeToHtml(resume));
      doc.close();
    }
    previewModal.hidden = false;
  }

  function isResumeShaped(obj: Record<string, unknown> | null): boolean {
    if (!obj || typeof obj !== 'object') return false;
    return 'basics' in obj || 'work' in obj || 'education' in obj;
  }
  previewModalClose.addEventListener('click', () => {
    previewModal.hidden = true;
  });
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) previewModal.hidden = true;
  });

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    headerMenu.hidden = !headerMenu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!headerMenu.hidden));
  });
  document.addEventListener('click', () => {
    headerMenu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  });
  headerMenu.addEventListener('click', (e) => e.stopPropagation());

  headerMenu.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('.menu-item');
    if (!item) return;
    const action = item.getAttribute('data-action');
    headerMenu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');

    if (action === 'preview-profile') {
      try {
        const { profile } = await getProfile();
        if (profile && isResumeShaped(profile)) {
          showResumePreviewModal('Profile', profile);
        } else {
          showPreviewModal('Profile', profile ? JSON.stringify(profile, null, 2) : 'No profile set.');
        }
      } catch (err) {
        showPreviewModal('Profile', err instanceof Error ? err.message : 'Failed to load profile.');
      }
      return;
    }
    if (action === 'preview-resume') {
      try {
        const { resume } = await getBaseResume();
        showResumePreviewModal('Base resume', resume ?? null);
      } catch (err) {
        showPreviewModal('Base resume', err instanceof Error ? err.message : 'No base resume or failed to load.');
      }
      return;
    }
    if (action === 'preview-transcript') {
      try {
        const { hasTranscript } = await getTranscriptStatus();
        showPreviewModal('Transcript', hasTranscript ? 'Transcript uploaded and saved.' : 'No transcript uploaded.');
      } catch (err) {
        showPreviewModal('Transcript', err instanceof Error ? err.message : 'Failed to check transcript.');
      }
      return;
    }
    if (action === 'upload-resume-pdf') {
      uploadResumePdfInput.click();
      return;
    }
    if (action === 'upload-transcript') {
      uploadTranscriptInput.click();
      return;
    }
    if (action === 'base-resume') {
      baseResumeModal.hidden = false;
      baseResumeUploadError.hidden = true;
      baseResumeEditError.hidden = true;
      return;
    }
    if (action === 'check-connection') {
      try {
        const status = await getHandshakeSessionStatus();
        addMessage('assistant', status.connected ? 'Handshake connected successfully.' : 'Handshake is not connected. Use the browser extension to upload your session.');
      } catch {
        addMessage('assistant', 'Could not verify connection. Please try again.');
      }
      return;
    }
    if (action === 'copy-token') {
      navigator.clipboard.writeText(token).then(
        () => addMessage('assistant', 'Token copied to clipboard.'),
        () => addMessage('assistant', 'Failed to copy token.')
      );
      return;
    }
    if (action === 'logout') {
      stopPolling();
      onLogout();
    }
  });

  uploadResumePdfInput.addEventListener('change', async () => {
    const file = uploadResumePdfInput.files?.[0];
    uploadResumePdfInput.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      addMessage('assistant', 'Please choose a PDF file.');
      return;
    }
    try {
      await uploadResumePdf(file);
      addMessage('assistant', 'Profile updated from your resume PDF. You can send a job URL to apply.');
    } catch (err) {
      addMessage('assistant', err instanceof Error ? err.message : 'Upload failed.');
    }
  });

  uploadTranscriptInput.addEventListener('change', async () => {
    const file = uploadTranscriptInput.files?.[0];
    uploadTranscriptInput.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      addMessage('assistant', 'Please choose a PDF file.');
      return;
    }
    try {
      await uploadTranscript(file);
      addMessage('assistant', 'Transcript saved. I\'ll use it when a job requires one.');
    } catch (err) {
      addMessage('assistant', err instanceof Error ? err.message : 'Upload failed.');
    }
  });

  baseResumeModalClose.addEventListener('click', () => {
    baseResumeModal.hidden = true;
  });

  baseResumeUploadPdfBtn.addEventListener('click', async () => {
    const file = baseResumeFile.files?.[0];
    baseResumeFile.value = '';
    baseResumeUploadError.hidden = true;
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
      baseResumeUploadError.textContent = 'Please select a PDF file.';
      baseResumeUploadError.hidden = false;
      return;
    }
    baseResumeUploadPdfBtn.disabled = true;
    baseResumeUploadError.textContent = '';
    try {
      await postBaseResumeFile(file);
      baseResumeUploadError.textContent = 'Base resume saved from PDF.';
      baseResumeUploadError.hidden = false;
      baseResumeUploadError.style.color = '';
    } catch (err) {
      baseResumeUploadError.textContent = err instanceof Error ? err.message : 'Upload failed.';
      baseResumeUploadError.hidden = false;
    } finally {
      baseResumeUploadPdfBtn.disabled = false;
    }
  });

  baseResumeSaveTextBtn.addEventListener('click', async () => {
    const text = baseResumePaste.value?.trim() ?? '';
    baseResumeUploadError.hidden = true;
    if (!text) {
      baseResumeUploadError.textContent = 'Paste some resume text first.';
      baseResumeUploadError.hidden = false;
      return;
    }
    baseResumeSaveTextBtn.disabled = true;
    baseResumeUploadError.textContent = '';
    try {
      await postBaseResumeText(text);
      baseResumeUploadError.textContent = 'Base resume saved from text.';
      baseResumeUploadError.hidden = false;
      baseResumeUploadError.style.color = '';
    } catch (err) {
      baseResumeUploadError.textContent = err instanceof Error ? err.message : 'Save failed.';
      baseResumeUploadError.hidden = false;
    } finally {
      baseResumeSaveTextBtn.disabled = false;
    }
  });

  baseResumeLoadEditBtn.addEventListener('click', async () => {
    baseResumeEditError.hidden = true;
    baseResumeLoadEditBtn.disabled = true;
    try {
      const { resume } = await getBaseResume();
      baseResumeFormContainer.hidden = false;
      baseResumeFormContainer.innerHTML = '';
      baseResumeFormApi = createResumeForm(baseResumeFormContainer, resume);
      baseResumeSaveEditsBtn.hidden = false;
    } catch (err) {
      baseResumeEditError.textContent = err instanceof Error ? err.message : 'No base resume found. Upload or paste one first.';
      baseResumeEditError.hidden = false;
    } finally {
      baseResumeLoadEditBtn.disabled = false;
    }
  });

  baseResumeSaveEditsBtn.addEventListener('click', async () => {
    if (!baseResumeFormApi) return;
    const errMsg = baseResumeFormApi.validate();
    if (errMsg) {
      baseResumeEditError.textContent = errMsg;
      baseResumeEditError.hidden = false;
      return;
    }
    baseResumeEditError.hidden = true;
    baseResumeSaveEditsBtn.disabled = true;
    try {
      const value = baseResumeFormApi.getValue();
      await putBaseResume(value);
      baseResumeEditError.textContent = 'Edits saved.';
      baseResumeEditError.hidden = false;
      baseResumeEditError.style.color = '';
    } catch (err) {
      baseResumeEditError.textContent = err instanceof Error ? err.message : 'Save failed.';
      baseResumeEditError.hidden = false;
    } finally {
      baseResumeSaveEditsBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', () => {
    stopPolling();
    onLogout();
  });

  function showMessagesLoading(): void {
    messagesEl.innerHTML = `
      <div class="chat-messages-loading" aria-live="polite">
        <span class="chat-messages-loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
        <span class="chat-messages-loading-text">Loading messages…</span>
      </div>
    `;
  }

  showMessagesLoading();
  input.focus();

  getChatMessages(50)
    .then((res) => {
      messages.length = 0;
      messages.push(...res.messages);
      renderMessages();
    })
    .catch(() => {
      renderMessages();
    });

  // Handle ?session=uploaded from extension redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get('session') === 'uploaded') {
    const cleanUrl = window.location.pathname + (window.location.hash || '');
    window.history.replaceState({}, '', cleanUrl);
    getHandshakeSessionStatus()
      .then((status) => {
        if (status.connected) {
          addMessage('assistant', 'Handshake connected successfully.');
        } else {
          addMessage('assistant', 'Could not verify connection. Try the "Check connection" button.');
        }
      })
      .catch(() => {
        addMessage('assistant', 'Could not verify connection. Try the "Check connection" button.');
      });
  }

  // Optional: poll session status when tab is focused (for users who upload from extension while chat is open)
  let sessionPollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSessionUpdatedAt: string | null = null;
  function pollSessionStatus(): void {
    getHandshakeSessionStatus()
      .then((status) => {
        if (status.connected && status.updatedAt) {
          if (lastSessionUpdatedAt !== null && status.updatedAt !== lastSessionUpdatedAt) {
            addMessage('assistant', 'Handshake connected successfully.');
          }
          lastSessionUpdatedAt = status.updatedAt;
        }
      })
      .catch(() => {});
  }
  function startSessionPoll(): void {
    if (sessionPollTimer) return;
    sessionPollTimer = setInterval(pollSessionStatus, 60_000);
  }
  function stopSessionPoll(): void {
    if (sessionPollTimer) {
      clearInterval(sessionPollTimer);
      sessionPollTimer = null;
    }
  }
  if (document.visibilityState === 'visible') startSessionPoll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startSessionPoll();
    else stopSessionPoll();
  });
}
