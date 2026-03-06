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
    <div id="applied-card-container" className="max-w-[85%] py-3 px-4 rounded-xl text-[15px] leading-relaxed self-start bg-assistant border border-border rounded-bl">
      <div className="break-words">
        <div className="mb-2.5">
          <strong className="text-text">Applied with these documents</strong>
          <div className="text-[13px] text-text-muted mt-1">{jobTitle}</div>
        </div>
        {hasResume && (
          <div className="my-2.5 pt-2 border-t border-border first:border-t-0 first:pt-0">
            <div className="text-[13px] text-text-muted mb-2 whitespace-pre-wrap break-words">{resumeSummary}</div>
            <button type="button" className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border transition-colors" onClick={onDownloadResume}>
              Download resume PDF
            </button>
          </div>
        )}
        {hasCover && (
          <div className="my-2.5 pt-2 border-t border-border first:border-t-0 first:pt-0">
            <div className="text-[13px] text-text-muted mb-2 whitespace-pre-wrap break-words">{coverPreview}</div>
            <button type="button" className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border transition-colors" onClick={onDownloadCover}>
              Download cover PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
