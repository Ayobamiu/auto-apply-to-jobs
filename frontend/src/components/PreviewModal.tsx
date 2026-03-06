import { useEffect, useRef } from 'react';
import { renderResumeToHtml } from '../resume-preview';

interface PreviewModalProps {
  open: boolean;
  title: string;
  /** When set, show resume theme HTML in an iframe. Otherwise show bodyText in a pre. */
  resume?: Record<string, unknown> | null;
  bodyText?: string;
  onClose: () => void;
}

export function PreviewModal({
  open,
  title,
  resume,
  bodyText,
  onClose,
}: PreviewModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    bodyRef.current.innerHTML = '';
    if (resume !== undefined && resume !== null) {
      const frame = document.createElement('iframe');
      frame.className = 'preview-modal-iframe';
      frame.setAttribute('title', title);
      bodyRef.current.appendChild(frame);
      const doc = frame.contentDocument;
      if (doc) {
        doc.open();
        doc.write(renderResumeToHtml(resume));
        doc.close();
      }
    } else {
      const pre = document.createElement('pre');
      pre.className = 'preview-modal-text';
      pre.textContent = bodyText ?? '';
      bodyRef.current.appendChild(pre);
    }
  }, [open, title, resume, bodyText]);

  if (!open) return null;

  const isResume = resume !== undefined && resume !== null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-card border border-border rounded-xl w-full max-h-[90vh] overflow-y-auto p-5 ${isResume ? 'max-w-[880px]' : 'max-w-[560px]'}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button type="button" className="py-1.5 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border" onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={bodyRef} className="preview-modal-body max-h-[70vh] overflow-auto" />
      </div>
    </div>
  );
}
