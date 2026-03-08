import { useState, useCallback } from "react";
import initialResume from "../sample-resume.json";
import { ResumeDocument } from "./ResumeDocument";
import { Check, Send, Sparkles, XIcon } from "lucide-react";

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
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = useCallback((next: Record<string, unknown>) => {
    setResume(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota or other storage errors
    }
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);

    // Simulate API Call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsGenerating(false);
    setIsSuccess(true);

    // Revert back to "Generate" after 2 seconds
    setTimeout(() => setIsSuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <div className="flex-1 overflow-auto px-4 py-4 md:max-w-3xl md:mx-auto md:px-6 md:py-5 w-full">
        <ResumeDocument
          resume={resume}
          onChange={handleChange}
          compact={mode === "preview"}
          readOnly={mode === "preview"}
        />
      </div>
      {/* Floating buttons — bottom-right */}
      <div className="no-print fixed bottom-6 right-6 z-10 flex items-center gap-3">
        {mode === "preview" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-14 px-6 flex items-center gap-2 rounded-full 
                 bg-white text-slate-700 border border-slate-200/80
                 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-300
                 hover:shadow-[0_8px_20px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 
                 active:scale-95 group"
            title="In the print dialog, turn off 'Headers and footers' and choose 'Save as PDF'."
            aria-label="Download PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-slate-500 group-hover:text-slate-900 transition-colors"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden lg:block font-semibold text-sm tracking-tight text-slate-600 group-hover:text-slate-900">
              Download PDF
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          className="h-14 px-6 flex items-center gap-2 rounded-full 
               bg-slate-900 text-white shadow-lg shadow-slate-200/50 
               transition-all duration-300 hover:bg-black 
               hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
          title={mode === "edit" ? "Preview" : "Edit"}
          aria-label={mode === "edit" ? "Switch to preview" : "Switch to edit"}
        >
          {mode === "edit" ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 transition-transform duration-300 group-hover:rotate-12"
                aria-hidden
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="font-semibold text-sm tracking-tight hidden lg:block">
                Preview Mode
              </span>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 transition-transform duration-300"
                aria-hidden
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="font-semibold text-sm tracking-tight hidden lg:block">
                Back to Edit
              </span>
            </>
          )}
        </button>
      </div>
      {/* AI Assistant */}
      {/* AI Assistant Button */}
      <div className="no-print fixed bottom-6 lg:left-1/2 left-6 lg:-translate-x-1/2 z-50">
        {!aiOpen && (
          <button
            onClick={() => setAiOpen(true)}
            className="group relative h-14 px-8 flex items-center gap-3 rounded-full 
               bg-[#0f172a] text-white overflow-hidden transition-all duration-300
               hover:ring-2 hover:ring-slate-400 hover:ring-offset-2 hover:ring-offset-white"
          >
            {/* The "Ghost" Glow - moving behind the text */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500
                    bg-[radial-gradient(circle_at_var(--x,_50%)_var(--y,_50%),_rgba(255,255,255,0.15)_0%,_transparent_50%)]"
            />

            <Sparkles
              size={20}
              className="text-amber-300 transition-transform group-hover:rotate-12"
            />
            <span className="text-sm font-semibold tracking-tight">
              Ask Assistant
            </span>

            {/* Subtle bottom highlight */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </button>
        )}
      </div>
      <div className="no-print fixed lg:bottom-6 bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-200">
        {aiOpen && (
          <div
            className="flex flex-col gap-3 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] 
                  rounded-2xl p-4 border border-slate-200/50 w-[440px] max-w-[95vw] 
                  animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center gap-2 px-1 text-slate-500">
              <Sparkles size={14} />
              <span className="text-[11px] uppercase tracking-widest font-bold">
                Resume Intelligence
              </span>
            </div>

            <textarea
              autoFocus
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Try: 'Make my bullet points more action-oriented'..."
              // className="w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent placeholder:text-slate-400 resize-none text-slate-800"
              disabled={isGenerating}
              className={`w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent 
             placeholder:text-slate-400 resize-none text-slate-800 transition-opacity
             ${isGenerating ? "opacity-50" : "opacity-100"}`}
              rows={3}
            />

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                onClick={() => setAiOpen(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2"
              >
                Dismiss
              </button>
              <button
                disabled={isGenerating || isSuccess || !aiInput.trim()}
                onClick={handleGenerate}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-500 font-medium text-sm overflow-hidden min-w-[140px]
    ${isGenerating ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
    ${isSuccess ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : ""}
    ${!isGenerating && !isSuccess ? "bg-slate-900 text-white hover:bg-black active:scale-95 shadow-sm" : ""}
  `}
              >
                {/* Shimmer for Processing */}
                {isGenerating && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 to-transparent -translate-x-full animate-shimmer" />
                )}

                <div className="relative z-10 flex items-center gap-2">
                  {isSuccess ? (
                    <>
                      <Check
                        size={18}
                        className="animate-in zoom-in duration-300"
                      />
                      <span className="animate-in slide-in-from-bottom-1">
                        Updated
                      </span>
                    </>
                  ) : isGenerating ? (
                    <>
                      <span>Refining</span>
                      <div className="flex gap-1">
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span>Generate</span>
                      <Send
                        size={16}
                        className="opacity-70 group-hover:translate-x-1 transition-transform"
                      />
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
