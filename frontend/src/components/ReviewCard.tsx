import type { PipelineArtifacts } from '../api';

interface ReviewCardProps {
  jobId: string;
  artifacts: PipelineArtifacts;
  onOpenDetailed: () => void;
  onDownloadResume: () => void;
  onDownloadCover: () => void;
  onCancel: () => void;
  error: string | null;
}

export function ReviewCard({
  artifacts,
  onOpenDetailed,
  onDownloadResume,
  onDownloadCover,
  onCancel,
  error,
}: ReviewCardProps) {
  const hasCover = !!artifacts.cover?.text;
  return (
    <div id="review-card-container" className="chat-bubble chat-bubble-assistant review-card">
      <div className="chat-bubble-content">
        <div className="review-card-header">
          <strong>Review before apply</strong>
          <div className="review-job-title">{artifacts.jobTitle}</div>
        </div>
        <p className="review-card-hint">
          We've drafted a tailored resume{hasCover ? ' and cover letter' : ''}. You can open a
          full-page editor to make changes before we submit.
        </p>
        <div className="review-actions">
          <button
            type="button"
            className="review-btn review-btn-primary"
            onClick={onOpenDetailed}
          >
            Open detailed review
          </button>
          <button type="button" className="review-btn" onClick={onDownloadResume}>
            Download resume PDF
          </button>
          {hasCover && (
            <button type="button" className="review-btn" onClick={onDownloadCover}>
              Download cover PDF
            </button>
          )}
          <button type="button" className="review-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {error && (
          <div id="review-action-error" className="review-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
