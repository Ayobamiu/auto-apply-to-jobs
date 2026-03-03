import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sendChat,
  getChatMessages,
  getPipelineJobStatus,
  getPipelineArtifacts,
  cancelPipelineJob,
  downloadPipelineArtifactPdf,
  downloadAppliedArtifactPdf,
  getHandshakeSessionStatus,
  getSettings,
  putSettings,
  getProfile,
  getTranscriptStatus,
  getBaseResume,
  uploadResumePdf,
  uploadTranscript,
  type ChatMessage,
  type AutomationLevel,
  type PipelineArtifacts,
  type AppliedArtifacts,
} from '../api';
import { MessageList, type TypingState } from './MessageList';
import { ReviewCard } from './ReviewCard';
import { AppliedCard } from './AppliedCard';
import { ReviewView } from './ReviewView';
import { BaseResumeModal } from './BaseResumeModal';
import { PreviewModal } from './PreviewModal';

const MAX_MESSAGES_TO_BACKEND = 50;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100;

interface ChatProps {
  onLogout: () => void;
}

export function Chat({ onLogout }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>('review');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [reviewCard, setReviewCard] = useState<{ jobId: string; artifacts: PipelineArtifacts } | null>(null);
  const [reviewCardError, setReviewCardError] = useState<string | null>(null);
  const [appliedCard, setAppliedCard] = useState<{
    jobId: string;
    jobTitle: string;
    applied: AppliedArtifacts;
  } | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [reviewViewOpen, setReviewViewOpen] = useState<{
    jobId: string;
    artifacts: PipelineArtifacts;
  } | null>(null);
  const [baseResumeModalOpen, setBaseResumeModalOpen] = useState(false);
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    resume?: Record<string, unknown> | null;
    bodyText?: string;
  }>({ open: false, title: '', bodyText: '' });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uploadResumePdfInputRef = useRef<HTMLInputElement>(null);
  const uploadTranscriptInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [
      ...prev,
      { role, content, timestamp: new Date().toISOString() },
    ]);
  }, []);

  useEffect(() => {
    setLoadingMessages(true);
    getChatMessages(50)
      .then((res) => setMessages(res.messages))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, []);

  // Handle ?session=uploaded from extension redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'uploaded') {
      window.history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
      getHandshakeSessionStatus()
        .then((status) => {
          addMessage(
            'assistant',
            status.connected
              ? 'Handshake connected successfully.'
              : 'Could not verify connection. Try the "Check connection" button.'
          );
        })
        .catch(() => {
          addMessage(
            'assistant',
            'Could not verify connection. Try the "Check connection" button.'
          );
        });
    }
  }, [addMessage]);

  // Poll session status when tab is visible (for extension upload while chat open)
  useEffect(() => {
    let sessionPollTimer: ReturnType<typeof setInterval> | null = null;
    let lastSessionUpdatedAt: string | null = null;
    function poll() {
      getHandshakeSessionStatus()
        .then((status) => {
          if (status.connected && status.updatedAt != null && lastSessionUpdatedAt !== null && status.updatedAt !== lastSessionUpdatedAt) {
            lastSessionUpdatedAt = status.updatedAt;
            addMessage('assistant', 'Handshake connected successfully.');
          } else if (status.connected && status.updatedAt) {
            lastSessionUpdatedAt = status.updatedAt;
          }
        })
        .catch(() => {});
    }
    function start() {
      if (sessionPollTimer) return;
      sessionPollTimer = setInterval(poll, 60_000);
    }
    function stop() {
      if (sessionPollTimer) {
        clearInterval(sessionPollTimer);
        sessionPollTimer = null;
      }
    }
    if (document.visibilityState === 'visible') start();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [addMessage]);

  useEffect(() => {
    getSettings()
      .then((s) => setAutomationLevel(s.automationLevel))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = () => setMenuOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollAttemptsRef.current = 0;
    setPollingJobId(null);
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      setPollingJobId(jobId);
      pollAttemptsRef.current = 0;
      setTyping({
        phase: 'Starting...',
        cancelOpts: {
          jobId,
          onCancel: () => {
            cancelPipelineJob(jobId)
              .then((r) => {
                if (r.cancelled) {
                  setTyping(null);
                  addMessage('assistant', 'Application cancelled.');
                  stopPolling();
                }
              })
              .catch(() => {
                addMessage('assistant', 'Could not cancel. You can try again or ask "check status".');
              });
          },
        },
      });
    },
    [addMessage, stopPolling]
  );

  useEffect(() => {
    const jobId = pollingJobId;
    if (!jobId) return;

    function poll() {
      if (!jobId || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          addMessage(
            'assistant',
            "I've been checking for a while. You can ask \"check status\" anytime to get an update."
          );
        }
        setTyping(null);
        stopPolling();
        return;
      }
      pollAttemptsRef.current += 1;

      getPipelineJobStatus(jobId)
        .then((job) => {
          if (job.status === 'awaiting_approval') {
            setTyping(null);
            getPipelineArtifacts(jobId)
              .then((artifacts) => setReviewCard({ jobId, artifacts }))
              .catch(() => addMessage('assistant', 'Could not load artifacts for review.'));
            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }
          if (job.status === 'done') {
            setTyping(null);
            setReviewCard(null);
            const msg =
              job.userMessage ??
              (job.error ? `Failed: ${job.error}` : 'Pipeline completed.');
            addMessage('assistant', msg);
            const applied = job.result?.appliedArtifacts;
            const jobTitle =
              job.result &&
              typeof job.result === 'object' &&
              (job.result as Record<string, unknown>).job &&
              typeof (job.result as Record<string, unknown>).job === 'object'
                ? String(
                    ((job.result as Record<string, unknown>).job as Record<string, unknown>).title ??
                      ''
                  )
                : '';
            if (applied && (applied.resume || applied.coverLetter?.text)) {
              setAppliedCard({
                jobId,
                jobTitle: jobTitle || 'Job',
                applied,
              });
            }
            stopPolling();
            return;
          }
          if (job.status === 'failed') {
            setTyping(null);
            setReviewCard(null);
            addMessage('assistant', `Failed: ${job.error ?? 'Unknown error'}`);
            stopPolling();
            return;
          }
          if (job.status === 'cancelled') {
            setTyping(null);
            setReviewCard(null);
            addMessage('assistant', 'That application was cancelled.');
            stopPolling();
            return;
          }
          setTyping({
            phase: job.phase ?? 'Processing...',
            cancelOpts: {
              jobId,
              onCancel: () => {
                cancelPipelineJob(jobId)
                  .then((r) => {
                    if (r.cancelled) {
                      setTyping(null);
                      addMessage('assistant', 'Application cancelled.');
                      stopPolling();
                    }
                  })
                  .catch(() => {
                    addMessage(
                      'assistant',
                      'Could not cancel. You can try again or ask "check status".'
                    );
                  });
              },
            },
          });
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        })
        .catch(() => {
          setTyping(null);
          stopPolling();
        });
    }

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [pollingJobId, addMessage, stopPolling]);

  const handleAutomationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as AutomationLevel;
      setAutomationLevel(value);
      putSettings({ automationLevel: value }).catch(() => {
        setAutomationLevel(value === 'full' ? 'review' : 'full');
      });
    },
    []
  );

  const handleSend = useCallback(async () => {
    const input = inputRef.current;
    if (!input) return;
    const text = input.value.trim();
    if (!text || sending) return;

    addMessage('user', text);
    input.value = '';
    if (input.style) input.style.height = 'auto';
    setSending(true);
    setTyping({ phase: null, cancelOpts: null });

    try {
      const historySlice = messages.slice(-MAX_MESSAGES_TO_BACKEND);
      const res = await sendChat(text, historySlice);
      setTyping(null);
      addMessage('assistant', res.reply);
      if (res.meta?.pollStatus && res.meta.jobId) {
        startPolling(res.meta.jobId);
      }
    } catch (err) {
      setTyping(null);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      addMessage('assistant', `Error: ${msg}`);
    } finally {
      setSending(false);
      input.focus();
    }
  }, [messages, sending, addMessage, startPolling]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void handleSend();
    },
    [handleSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  function isResumeShaped(obj: Record<string, unknown> | null): boolean {
    if (!obj || typeof obj !== 'object') return false;
    return 'basics' in obj || 'work' in obj || 'education' in obj;
  }

  const handleMenuAction = useCallback(
    async (action: string) => {
      setMenuOpen(false);
      if (action === 'preview-profile') {
        try {
          const { profile } = await getProfile();
          if (profile && isResumeShaped(profile)) {
            setPreviewModal({ open: true, title: 'Profile', resume: profile });
          } else {
            setPreviewModal({
              open: true,
              title: 'Profile',
              bodyText: profile ? JSON.stringify(profile, null, 2) : 'No profile set.',
            });
          }
        } catch (err) {
          setPreviewModal({
            open: true,
            title: 'Profile',
            bodyText: err instanceof Error ? err.message : 'Failed to load profile.',
          });
        }
        return;
      }
      if (action === 'preview-resume') {
        try {
          const { resume } = await getBaseResume();
          setPreviewModal({ open: true, title: 'Base resume', resume: resume ?? null });
        } catch (err) {
          setPreviewModal({
            open: true,
            title: 'Base resume',
            bodyText: err instanceof Error ? err.message : 'No base resume or failed to load.',
          });
        }
        return;
      }
      if (action === 'preview-transcript') {
        try {
          const { hasTranscript } = await getTranscriptStatus();
          setPreviewModal({
            open: true,
            title: 'Transcript',
            bodyText: hasTranscript ? 'Transcript uploaded and saved.' : 'No transcript uploaded.',
          });
        } catch (err) {
          setPreviewModal({
            open: true,
            title: 'Transcript',
            bodyText: err instanceof Error ? err.message : 'Failed to check transcript.',
          });
        }
        return;
      }
      if (action === 'upload-resume-pdf') {
        uploadResumePdfInputRef.current?.click();
        return;
      }
      if (action === 'upload-transcript') {
        uploadTranscriptInputRef.current?.click();
        return;
      }
      if (action === 'base-resume') {
        setBaseResumeModalOpen(true);
        return;
      }
      if (action === 'check-connection') {
        try {
          const status = await getHandshakeSessionStatus();
          addMessage(
            'assistant',
            status.connected
              ? 'Handshake connected successfully.'
              : 'Handshake is not connected. Use the browser extension to upload your session.'
          );
        } catch {
          addMessage('assistant', 'Could not verify connection. Please try again.');
        }
        return;
      }
      if (action === 'copy-token') {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
        navigator.clipboard
          .writeText(token)
          .then(
            () => addMessage('assistant', 'Token copied to clipboard.'),
            () => addMessage('assistant', 'Failed to copy token.')
          );
        return;
      }
    },
    [addMessage]
  );

  const handleUploadResumePdf = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
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
    },
    [addMessage]
  );

  const handleUploadTranscript = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        addMessage('assistant', 'Please choose a PDF file.');
        return;
      }
      try {
        await uploadTranscript(file);
        addMessage('assistant', "Transcript saved. I'll use it when a job requires one.");
      } catch (err) {
        addMessage('assistant', err instanceof Error ? err.message : 'Upload failed.');
      }
    },
    [addMessage]
  );

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <h1 className="chat-header-title">Auto Apply</h1>
        <div className="chat-header-actions">
          <label className="header-label">
            Automation:{' '}
            <select
              className="header-select"
              title="Review: pause to edit before apply. Full: apply automatically."
              value={automationLevel}
              onChange={handleAutomationChange}
            >
              <option value="review">Review before apply</option>
              <option value="full">Full auto</option>
            </select>
          </label>
          <div className="header-menu-wrap">
            <button
              type="button"
              className="header-btn"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              Menu
            </button>
            <div
              className="header-menu"
              hidden={!menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                const action = (e.target as HTMLElement).closest('.menu-item')?.getAttribute('data-action');
                if (action === 'logout') {
                  stopPolling();
                  onLogout();
                  return;
                }
                if (action) void handleMenuAction(action);
              }}
            >
              <button type="button" className="menu-item" data-action="preview-profile">
                Preview profile
              </button>
              <button type="button" className="menu-item" data-action="preview-resume">
                Preview resume
              </button>
              <button type="button" className="menu-item" data-action="preview-transcript">
                Preview transcript
              </button>
              <div className="menu-divider" />
              <button type="button" className="menu-item" data-action="upload-resume-pdf">
                Upload resume PDF
              </button>
              <input
                ref={uploadResumePdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={handleUploadResumePdf}
              />
              <button type="button" className="menu-item" data-action="upload-transcript">
                Upload transcript
              </button>
              <input
                ref={uploadTranscriptInputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={handleUploadTranscript}
              />
              <button type="button" className="menu-item" data-action="base-resume">
                Base resume
              </button>
              <button type="button" className="menu-item" data-action="check-connection">
                Check connection
              </button>
              <button type="button" className="menu-item" data-action="copy-token">
                Copy Token
              </button>
              <div className="menu-divider" />
              <button type="button" className="menu-item menu-item-secondary" data-action="logout">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {loadingMessages ? (
        <main className="chat-messages">
          <div className="chat-messages-loading" aria-live="polite">
            <span className="chat-messages-loading-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
            <span className="chat-messages-loading-text">Loading messages…</span>
          </div>
        </main>
      ) : (
        <MessageList messages={messages} typing={typing}>
          {reviewCard && (
            <ReviewCard
              jobId={reviewCard.jobId}
              artifacts={reviewCard.artifacts}
              onOpenDetailed={() => setReviewViewOpen({ jobId: reviewCard.jobId, artifacts: reviewCard.artifacts })}
              onDownloadResume={async () => {
                try {
                  await downloadPipelineArtifactPdf(reviewCard.jobId, 'resume');
                } catch (err) {
                  setReviewCardError(err instanceof Error ? err.message : 'Download failed.');
                }
              }}
              onDownloadCover={async () => {
                try {
                  await downloadPipelineArtifactPdf(reviewCard.jobId, 'cover');
                } catch (err) {
                  setReviewCardError(err instanceof Error ? err.message : 'Download failed.');
                }
              }}
              onCancel={() => {
                setReviewCard(null);
                setReviewCardError(null);
                addMessage(
                  'assistant',
                  'No problem. You can download the resume and cover letter to apply manually.'
                );
              }}
              error={reviewCardError}
            />
          )}
          {appliedCard && (
            <AppliedCard
              jobId={appliedCard.jobId}
              jobTitle={appliedCard.jobTitle}
              applied={appliedCard.applied}
              onDownloadResume={() =>
                downloadAppliedArtifactPdf(appliedCard.jobId, 'resume').catch((err) =>
                  addMessage('assistant', err instanceof Error ? err.message : 'Download failed.')
                )
              }
              onDownloadCover={() =>
                downloadAppliedArtifactPdf(appliedCard.jobId, 'cover').catch((err) =>
                  addMessage('assistant', err instanceof Error ? err.message : 'Download failed.')
                )
              }
            />
          )}
        </MessageList>
      )}

      {reviewViewOpen && (
        <ReviewView
          jobId={reviewViewOpen.jobId}
          artifacts={reviewViewOpen.artifacts}
          onApproved={() => {
            setReviewViewOpen(null);
            setReviewCard(null);
          }}
          onCancelled={() => setReviewViewOpen(null)}
        />
      )}

      <BaseResumeModal
        open={baseResumeModalOpen}
        onClose={() => setBaseResumeModalOpen(false)}
      />

      <PreviewModal
        open={previewModal.open}
        title={previewModal.title}
        resume={previewModal.resume}
        bodyText={previewModal.bodyText}
        onClose={() => setPreviewModal((p) => ({ ...p, open: false }))}
      />

      <footer className="chat-footer">
        <form className="chat-form" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Type a message... (paste resume, send a job URL, or ask for help)"
            rows={2}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button type="submit" className="chat-send-btn" disabled={sending}>
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
