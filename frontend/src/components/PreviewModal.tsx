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
      className="base-resume-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`base-resume-modal-content preview-modal-content${isResume ? ' preview-modal-content--resume' : ''}`}
      >
        <div className="base-resume-modal-header">
          <h2>{title}</h2>
          <button type="button" className="header-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={bodyRef} className="preview-modal-body" />
      </div>
    </div>
  );
}
