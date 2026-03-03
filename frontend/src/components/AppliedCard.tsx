import type { AppliedArtifacts } from '../api';

interface AppliedCardProps {
  jobId: string;
  jobTitle: string;
  applied: AppliedArtifacts;
  onDownloadResume: () => void;
  onDownloadCover: () => void;
}

export function AppliedCard({
  jobId,
  jobTitle,
  applied,
  onDownloadResume,
  onDownloadCover,
}: AppliedCardProps) {
  const hasResume = applied.resume && typeof applied.resume === 'object';
  const hasCover = !!applied.coverLetter?.text;
  const resumeSummary = hasResume
    ? (() => {
        const b = (applied.resume as Record<string, unknown>).basics as
          | Record<string, unknown>
          | undefined;
        const name = String(b?.name ?? '');
        const label = String(b?.label ?? '');
        const work = (applied.resume as Record<string, unknown>).work as unknown[] | undefined;
        const n = Array.isArray(work) ? work.length : 0;
        return `${name}${label ? ` · ${label}` : ''}${n ? ` · ${n} experience(s)` : ''}`;
      })()
    : '';
  const coverPreview = hasCover
    ? applied.coverLetter!.text.slice(0, 200) +
      (applied.coverLetter!.text.length > 200 ? '…' : '')
    : '';

  return (
    <div id="applied-card-container" className="chat-bubble chat-bubble-assistant review-card applied-artifacts-card">
      <div className="chat-bubble-content">
        <div className="review-card-header">
          <strong>Applied with these documents</strong>
          <div className="review-job-title">{jobTitle}</div>
        </div>
        {hasResume && (
          <div className="applied-section">
            <div className="applied-summary">{resumeSummary}</div>
            <button type="button" className="review-btn" onClick={onDownloadResume}>
              Download resume PDF
            </button>
          </div>
        )}
        {hasCover && (
          <div className="applied-section">
            <div className="applied-cover-preview">{coverPreview}</div>
            <button type="button" className="review-btn" onClick={onDownloadCover}>
              Download cover PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
