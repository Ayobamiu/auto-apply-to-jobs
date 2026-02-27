import {
  sendChat,
  getPipelineJobStatus,
  getPipelineArtifacts,
  putPipelineArtifactResume,
  putPipelineArtifactCover,
  approvePipelineJob,
  downloadPipelineArtifactPdf,
  downloadAppliedArtifactPdf,
  getHandshakeSessionStatus,
  getUserIdFromToken,
  getSettings,
  putSettings,
  type ChatMessage,
  type PipelineArtifacts,
  type AppliedArtifacts,
  type AutomationLevel,
} from './api.js';
import { createResumeForm } from './resume-form.js';

const MAX_MESSAGES_TO_BACKEND = 50;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100;

function storageKey(): string {
  const uid = getUserIdFromToken() ?? 'unknown';
  return `chat_history_${uid}`;
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(messages));
}

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
  const messages: ChatMessage[] = loadHistory();
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
          <button id="check-connection-btn" class="header-btn" title="Check Handshake connection">Check connection</button>
          <button id="copy-token-btn" class="header-btn" title="Copy API token for extension">Copy Token</button>
          <button id="logout-btn" class="header-btn header-btn-secondary">Sign Out</button>
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
    </div>
  `;

  const messagesEl = document.getElementById('chat-messages')!;
  const form = document.getElementById('chat-form') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('chat-send') as HTMLButtonElement;
  const automationSelect = document.getElementById('automation-level') as HTMLSelectElement;
  const checkConnectionBtn = document.getElementById('check-connection-btn') as HTMLButtonElement;
  const copyTokenBtn = document.getElementById('copy-token-btn') as HTMLButtonElement;
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;

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

    const requiredSections = artifacts.requiredSections ?? ['resume', 'coverLetter'];
    const showResume = requiredSections.includes('resume');
    const showCover = requiredSections.includes('coverLetter');

    const container = document.createElement('div');
    container.id = 'review-card-container';
    container.className = 'chat-bubble chat-bubble-assistant review-card';

    let coverText = artifacts.cover?.text ?? '';

    const resumeSectionHtml = showResume
      ? `<details class="review-section">
          <summary>Resume</summary>
          <div id="review-resume-form"></div>
          <div id="review-resume-error" class="review-error" hidden></div>
        </details>`
      : '';
    const coverSectionHtml = showCover
      ? `<details class="review-section">
          <summary>Cover letter</summary>
          <textarea id="review-cover" class="review-textarea" rows="10" spellcheck="false"></textarea>
          <div id="review-cover-error" class="review-error" hidden></div>
        </details>`
      : '';
    const downloadResumeBtnHtml = showResume
      ? '<button type="button" id="review-download-resume" class="review-btn">Download resume PDF</button>'
      : '';
    const downloadCoverBtnHtml = showCover
      ? '<button type="button" id="review-download-cover" class="review-btn">Download cover PDF</button>'
      : '';

    const card = document.createElement('div');
    card.className = 'chat-bubble-content';
    card.innerHTML = `
      <div class="review-card-header">
        <strong>Review before apply</strong>
        <div class="review-job-title">${escapeHtml(artifacts.jobTitle)}</div>
      </div>
      ${resumeSectionHtml}
      ${coverSectionHtml}
      <div class="review-actions">
        <button type="button" id="review-save" class="review-btn">Save edits</button>
        ${downloadResumeBtnHtml}
        ${downloadCoverBtnHtml}
        <button type="button" id="review-approve" class="review-btn review-btn-primary">Approve and apply</button>
        <button type="button" id="review-cancel" class="review-btn">Cancel</button>
      </div>
      <div id="review-action-error" class="review-error" hidden></div>
    `;

    container.appendChild(card);
    reviewCardContainer = container;
    messagesEl.appendChild(container);
    scrollToBottom();

    let resumeFormApi: ReturnType<typeof createResumeForm> | null = null;
    if (showResume) {
      const formContainer = document.getElementById('review-resume-form')!;
      resumeFormApi = createResumeForm(formContainer, artifacts.resume ?? {});
    }
    const coverTa = document.getElementById('review-cover') as HTMLTextAreaElement | null;
    if (coverTa) coverTa.value = coverText;

    function showError(elId: string, msg: string): void {
      const el = document.getElementById(elId);
      if (el) {
        el.textContent = msg;
        el.hidden = false;
      }
    }
    function hideError(elId: string): void {
      const el = document.getElementById(elId);
      if (el) el.hidden = true;
    }

    document.getElementById('review-save')!.addEventListener('click', async () => {
      hideError('review-resume-error');
      hideError('review-cover-error');
      try {
        if (showResume && resumeFormApi) {
          const err = resumeFormApi.validate();
          if (err) {
            showError('review-resume-error', err);
            return;
          }
          await putPipelineArtifactResume(jobId, resumeFormApi.getValue());
        }
        if (showCover && coverTa) {
          await putPipelineArtifactCover(jobId, coverTa.value.trim() || ' ');
          coverText = coverTa.value;
        }
      } catch (err) {
        showError('review-resume-error', err instanceof Error ? err.message : 'Save failed.');
      }
    });

    const downloadResumeBtn = document.getElementById('review-download-resume');
    if (downloadResumeBtn) {
      downloadResumeBtn.addEventListener('click', async () => {
        try {
          await downloadPipelineArtifactPdf(jobId, 'resume');
        } catch (err) {
          showError('review-action-error', err instanceof Error ? err.message : 'Download failed.');
        }
      });
    }
    const downloadCoverBtn = document.getElementById('review-download-cover');
    if (downloadCoverBtn) {
      downloadCoverBtn.addEventListener('click', async () => {
        try {
          await downloadPipelineArtifactPdf(jobId, 'cover');
        } catch (err) {
          showError('review-action-error', err instanceof Error ? err.message : 'Download failed.');
        }
      });
    }

    document.getElementById('review-approve')!.addEventListener('click', async () => {
      hideError('review-action-error');
      try {
        await approvePipelineJob(jobId);
        removeReviewCard();
        if (currentPollJobId) startPolling(currentPollJobId);
      } catch (err) {
        showError('review-action-error', err instanceof Error ? err.message : 'Approve failed.');
      }
    });

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
    saveHistory(messages);
    renderMessages();
  }

  function showTypingIndicator(phase?: string | null): void {
    const existing = document.getElementById('typing-indicator');
    if (existing) {
      const content = existing.querySelector('.chat-bubble-content');
      if (content) {
        content.innerHTML = phase
          ? `<span class="chat-phase">${escapeHtml(phase)}</span>`
          : '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      }
      scrollToBottom();
      return;
    }
    const indicator = document.createElement('div');
    indicator.className = 'chat-bubble chat-bubble-assistant chat-typing';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = phase
      ? `<div class="chat-bubble-content"><span class="chat-phase">${escapeHtml(phase)}</span></div>`
      : '<div class="chat-bubble-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
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
    showTypingIndicator('Starting...');

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
          showTypingIndicator(job.phase ?? 'Processing...');
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

  checkConnectionBtn.addEventListener('click', async () => {
    const prevText = checkConnectionBtn.textContent;
    checkConnectionBtn.textContent = 'Checking…';
    checkConnectionBtn.disabled = true;
    try {
      const status = await getHandshakeSessionStatus();
      if (status.connected) {
        addMessage('assistant', 'Handshake connected successfully.');
      } else {
        addMessage('assistant', 'Handshake is not connected. Use the browser extension to upload your session.');
      }
    } catch {
      addMessage('assistant', 'Could not verify connection. Please try again.');
    } finally {
      checkConnectionBtn.textContent = prevText;
      checkConnectionBtn.disabled = false;
    }
  });

  copyTokenBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(token).then(
      () => {
        copyTokenBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyTokenBtn.textContent = 'Copy Token';
        }, 2000);
      },
      () => {
        copyTokenBtn.textContent = 'Failed';
        setTimeout(() => {
          copyTokenBtn.textContent = 'Copy Token';
        }, 2000);
      }
    );
  });

  logoutBtn.addEventListener('click', () => {
    stopPolling();
    onLogout();
  });

  renderMessages();
  input.focus();

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
