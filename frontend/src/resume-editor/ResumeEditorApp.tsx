import { useState, useCallback } from "react";
import initialResume from "../sample-resume.json";
import { ResumeDocument } from "./ResumeDocument";

const STORAGE_KEY = "auto-apply-resume-editor-draft";

function loadResumeFromStorage(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialResume as Record<string, unknown>;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed
      : (initialResume as Record<string, unknown>);
  } catch {
    return initialResume as Record<string, unknown>;
  }
}

export function ResumeEditorApp() {
  const [resume, setResume] = useState<Record<string, unknown>>(
    loadResumeFromStorage,
  );
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const handleChange = useCallback((next: Record<string, unknown>) => {
    setResume(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota or other storage errors
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <div className="flex-1 overflow-auto px-4 py-4 md:max-w-3xl md:mx-auto md:px-6 md:py-5 w-full">
        <div className="mb-3 no-print">
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] inline-flex items-center touch-manipulation transition-colors duration-200"
          >
            ← Back to app
          </a>
        </div>
        <ResumeDocument
          resume={resume}
          onChange={handleChange}
          compact={mode === "preview"}
          readOnly={mode === "preview"}
        />
      </div>
      {/* Floating buttons — bottom-right, always visible */}
      <div className="no-print fixed bottom-6 right-6 z-10 flex items-center gap-3">
        {mode === "preview" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-14 pl-5 pr-5 flex items-center gap-2 rounded-full touch-manipulation transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 bg-[#1a73e8] text-white hover:bg-[#1765cc] font-medium text-sm"
            title="In the print dialog, turn off 'Headers and footers' and choose 'Save as PDF'."
            aria-label="Download PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download PDF</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          className="h-14 pl-5 pr-5 flex items-center gap-2 rounded-full touch-manipulation transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 bg-[#1a73e8] text-white hover:bg-[#1765cc]"
        title={mode === "edit" ? "Preview" : "Edit"}
        aria-label={mode === "edit" ? "Switch to preview" : "Switch to edit"}
      >
        {mode === "edit" ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 transition-transform duration-200"
              aria-hidden
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="font-medium text-sm">Preview</span>
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 transition-transform duration-200"
              aria-hidden
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span className="font-medium text-sm">Edit</span>
          </>
        )}
      </button>
      </div>
    </div>
  );
}
