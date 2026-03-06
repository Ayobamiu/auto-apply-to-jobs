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
    <main ref={containerRef} id="chat-messages" className="chat-messages flex-1 overflow-y-auto py-5 px-5 flex flex-col gap-3">
      {messages.map((m) => (
        <div
          key={m.timestamp ?? Math.random()}
          className={`max-w-[85%] py-3 px-4 rounded-xl text-[15px] leading-relaxed relative ${
            m.role === 'user'
              ? 'self-end bg-user text-on-primary rounded-br'
              : 'self-start bg-assistant border border-border rounded-bl'
          }`}
        >
          <div className="break-words" dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }} />
          {m.timestamp && (
            <span className="block text-[11px] text-text-muted mt-1.5 opacity-70">
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      ))}
      {children}
      {typing != null && (
        <div className="max-w-[85%] py-3 px-4 rounded-xl text-[15px] leading-relaxed self-start bg-assistant border border-border rounded-bl chat-typing" id="typing-indicator">
          <div className="flex items-center flex-wrap gap-1 py-1">
            {typing.phase ? (
              <span>{typing.phase}</span>
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
                className="ml-2 py-1 px-2.5 text-xs bg-input border border-border rounded-md cursor-pointer hover:bg-border"
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
