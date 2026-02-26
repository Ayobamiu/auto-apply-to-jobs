import { sendChat, getUserIdFromToken, type ChatMessage, type ChatResponse } from './api.js';

const MAX_MESSAGES_TO_BACKEND = 50;
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 10;

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

  const token = localStorage.getItem('token') ?? '';

  container.innerHTML = `
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
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
  const copyTokenBtn = document.getElementById('copy-token-btn')!;
  const logoutBtn = document.getElementById('logout-btn')!;

  function scrollToBottom(): void {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessages(): void {
    messagesEl.innerHTML = messages
      .map(
        (m) =>
          `<div class="chat-bubble chat-bubble-${m.role}">
            <div class="chat-bubble-content">${formatMessage(m.content)}</div>
            ${m.timestamp ? `<span class="chat-bubble-time">${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
          </div>`
      )
      .join('');
    scrollToBottom();
  }

  function addMessage(role: 'user' | 'assistant', content: string): void {
    messages.push({ role, content, timestamp: new Date().toISOString() });
    saveHistory(messages);
    renderMessages();
  }

  function showTypingIndicator(): void {
    const indicator = document.createElement('div');
    indicator.className = 'chat-bubble chat-bubble-assistant chat-typing';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<div class="chat-bubble-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
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

    function poll(): void {
      if (!currentPollJobId || pollAttempts >= MAX_POLL_ATTEMPTS) {
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          addMessage('assistant', 'I\'ve been checking for a while. You can ask "check status" anytime to get an update.');
        }
        stopPolling();
        return;
      }
      pollAttempts++;

      const historySlice = messages.slice(-MAX_MESSAGES_TO_BACKEND);
      sendChat(`check status for ${currentPollJobId}`, historySlice)
        .then((res: ChatResponse) => {
          if (!res.meta?.pollStatus) {
            addMessage('assistant', res.reply);
            stopPolling();
          } else {
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        })
        .catch(() => {
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
}
