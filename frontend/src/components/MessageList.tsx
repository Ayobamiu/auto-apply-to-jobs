import { useEffect, useRef } from 'react';
import type { ChatMessage as ApiChatMessage } from '../api';

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

export interface TypingState {
  phase: string | null;
  cancelOpts: { jobId: string; onCancel: () => void } | null;
}

interface MessageListProps {
  messages: ApiChatMessage[];
  typing?: TypingState | null;
  children?: React.ReactNode;
}

export function MessageList({ messages, typing, children }: MessageListProps) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, children]);

  return (
    <main ref={containerRef} id="chat-messages" className="chat-messages">
      {messages.map((m) => (
        <div key={m.timestamp ?? Math.random()} className={`chat-bubble chat-bubble-${m.role}`}>
          <div
            className="chat-bubble-content"
            dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }}
          />
          {m.timestamp && (
            <span className="chat-bubble-time">
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      ))}
      {children}
      {typing != null && (
        <div className="chat-bubble chat-bubble-assistant chat-typing" id="typing-indicator">
          <div className="chat-bubble-content">
            {typing.phase ? (
              <span className="chat-phase">{typing.phase}</span>
            ) : (
              <>
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </>
            )}
            {typing.cancelOpts && (
              <button
                type="button"
                className="chat-cancel-btn"
                onClick={typing.cancelOpts.onCancel}
              >
                Cancel application
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
