import { render as renderResumeTheme } from 'jsonresume-theme-even';

/** Renders resume JSON to theme HTML for use in iframes (e.g. preview modals). */
export function renderResumeToHtml(resume: Record<string, unknown> | null): string {
  if (!resume) return '<!doctype html><html><body></body></html>';
  try {
    return renderResumeTheme(resume);
  } catch {
    return '<!doctype html><html><body><p style="font-family: system-ui, sans-serif; font-size: 14px; color: #555;">Could not render preview.</p></body></html>';
  }
}

export interface ResumePreviewApi {
  setResume(resume: Record<string, unknown> | null): void;
}

export function createResumePreview(
  container: HTMLElement,
  initialResume: Record<string, unknown> | null
): ResumePreviewApi {
  container.innerHTML = '';

  const frame = document.createElement('iframe');
  frame.className = 'review-view-resume-preview-frame';
  frame.setAttribute('title', 'Resume preview');
  frame.setAttribute('aria-label', 'Resume preview');
  container.appendChild(frame);

  let queued: Record<string, unknown> | null = initialResume;
  let renderTimer: number | null = null;

  const render = (resume: Record<string, unknown> | null): void => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const html = renderResumeToHtml(resume);
    doc.open();
    doc.write(html);
    doc.close();
  };

  if (initialResume) {
    render(initialResume);
  }

  const setResume = (resume: Record<string, unknown> | null): void => {
    queued = resume;
    if (renderTimer !== null) {
      window.clearTimeout(renderTimer);
    }
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      render(queued);
    }, 300);
  };

  return { setResume };
}

