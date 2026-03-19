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
  const hasDynamicForm = !!artifacts.hasDynamicForm;
  const reviewCount = artifacts.dynamicForm?.answers.filter((a) => a.requiresReview && a.value).length ?? 0;
  return (
    <div id="review-card-container" className="max-w-[85%] py-3 px-4 rounded-xl text-[15px] leading-relaxed self-start bg-assistant border border-border rounded-bl">
      <div className="break-words">
        <div className="mb-3">
          <strong className="text-text">Review before apply</strong>
          <div className="text-[13px] text-text-muted mt-1">{artifacts.jobTitle}</div>
        </div>
        <p className="text-[13px] text-text-muted mb-2.5">
          We've drafted a tailored resume{hasCover ? ' and cover letter' : ''}
          {hasDynamicForm ? ' and prefilled the application form' : ''}.
          You can open a full-page editor to make changes before we submit.
        </p>
        {hasDynamicForm && reviewCount > 0 && (
          <p className="text-[12px] text-yellow-400 mb-2">
            {reviewCount} form answer{reviewCount > 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} your review.
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            className="py-2 px-3.5 bg-accent border border-accent rounded-lg text-on-primary text-[13px] cursor-pointer hover:bg-accent-hover hover:border-accent-hover transition-colors"
            onClick={onOpenDetailed}
          >
            Open detailed review
          </button>
          <button type="button" className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border transition-colors" onClick={onDownloadResume}>
            Download resume PDF
          </button>
          {hasCover && (
            <button type="button" className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border transition-colors" onClick={onDownloadCover}>
              Download cover PDF
            </button>
          )}
          <button type="button" className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border transition-colors" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {error && (
          <div id="review-action-error" className="text-xs text-danger mt-1">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
