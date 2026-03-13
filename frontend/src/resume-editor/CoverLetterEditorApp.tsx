import { useState, useCallback, useEffect, useMemo } from "react";
import { Check, Send, Sparkles, ArrowLeft, Eye, Pencil, Download } from "lucide-react";
import { DiffView } from "../components/DiffView";
import { getPipelineJobStatus, postCoverLetterUpdate, putPipelineArtifactCover } from "../api";

export interface CoverLetterEditorAppProps {
  initialText?: string;
  jobId?: string;
  jobDescription?: string;
  editHistory?: string[];
  onSave?: (text: string) => void;
  onBack?: () => void;
}

export function CoverLetterEditorApp({
  initialText = "",
  jobId,
  jobDescription,
  editHistory,
  onSave: externalOnSave,
  onBack,
}: CoverLetterEditorAppProps) {
  const [text, setText] = useState(initialText);
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => { if (initialText && initialText !== text) setText(initialText); }, [initialText]);

  // Enforce post-submission restrictions (read-only preview).
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const s = await getPipelineJobStatus(jobId);
        const submitted =
          s.status === "submitted" ||
          (s.status === "done" && s.submit === true);
        if (!cancelled) {
          setIsSubmitted(submitted);
          if (submitted) return;
        }
      } catch {
        // ignore
      }
      if (cancelled) return;
      if (attempts >= 60) return;
      timer = window.setTimeout(poll, 5000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!isSubmitted) return;
    setMode("preview");
    setAiOpen(false);
  }, [isSubmitted]);

  const handleSave = useCallback((next: string) => {
    setText(next);
    if (jobId) putPipelineArtifactCover(jobId, next).catch(console.error);
    externalOnSave?.(next);
  }, [jobId, externalOnSave]);

  const handleGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const response = await postCoverLetterUpdate(text, aiInput, { jobDescription, editHistory });
      setProposedText(response.text);
      setAiOpen(false);
    } catch (err) { console.error("AI update failed:", err); }
    finally { setIsGenerating(false); }
  };

  const acceptChange = () => {
    if (proposedText != null) { handleSave(proposedText); setProposedText(null); setIsSuccess(true); setTimeout(() => setIsSuccess(false), 2000); }
  };
  const discardChange = () => setProposedText(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  };

  const hasProposal = proposedText != null;

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {onBack && (
        <div className="no-print flex items-center gap-3 px-4 py-2 border-b border-slate-100">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                if (isSubmitted) return;
                setMode((m) => (m === "edit" ? "preview" : "edit"));
              }}
              disabled={isSubmitted}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              title={isSubmitted ? "This job has been submitted. Editing is disabled." : undefined}
            >
              {mode === "edit" ? <><Eye size={14} /> Preview</> : <><Pencil size={14} /> Edit</>}
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-auto px-4 py-6 md:max-w-3xl md:mx-auto md:px-8 w-full ${hasProposal ? "pb-24" : ""}`}>
        {mode === "edit" && !hasProposal ? (
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); handleSave(e.target.value); }}
            className="w-full min-h-[60vh] text-sm leading-relaxed font-serif text-gray-800 outline-none resize-none bg-transparent"
            placeholder="Write your cover letter here..."
          />
        ) : hasProposal ? (
          <div className="prose prose-sm max-w-none font-serif text-gray-800 leading-relaxed">
            <DiffView original={text} proposed={proposedText} />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none font-serif text-gray-800 leading-relaxed whitespace-pre-wrap">
            {text || <span className="text-gray-400 italic">No cover letter yet</span>}
          </div>
        )}
      </div>

      {/* Accept/Discard bar */}
      {hasProposal && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4">
            <span className="text-sm font-medium">Proposed rewrite</span>
            <div className="h-8 w-[1px] bg-slate-700" />
            <button onClick={discardChange} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium hover:bg-slate-800 rounded-xl text-slate-300">Discard</button>
            <button onClick={acceptChange} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-xl active:scale-95">
              <Check size={14} /> Accept
            </button>
          </div>
        </div>
      )}

      {/* AI Assistant */}
      <div className={`no-print fixed lg:left-1/2 left-6 lg:-translate-x-1/2 z-40 transition-[bottom] duration-200 ${hasProposal ? "bottom-24" : "bottom-6"}`}>
        {!aiOpen && !isSubmitted && (
          <button onClick={() => { setAiOpen(true); setMode("preview"); }}
            className="group relative h-14 px-8 flex items-center gap-3 rounded-full bg-[#0f172a] text-white overflow-hidden transition-all hover:ring-2 hover:ring-slate-400 hover:ring-offset-2">
            <Sparkles size={20} className="text-amber-300 group-hover:rotate-12 transition-transform" />
            <span className="text-sm font-semibold">Improve Cover Letter</span>
          </button>
        )}
      </div>
      <div className="no-print fixed lg:bottom-6 bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all">
        {aiOpen && !isSubmitted && (
          <div className="flex flex-col gap-3 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-4 border border-slate-200/50 w-[440px] max-w-[95vw]">
            <div className="flex items-center gap-2 px-1 text-slate-500">
              <Sparkles size={14} />
              <span className="text-[11px] uppercase tracking-widest font-bold">Cover Letter Intelligence</span>
            </div>
            <textarea autoFocus value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Try: 'Make the opening more compelling'..."
              disabled={isGenerating}
              className={`w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent placeholder:text-slate-400 resize-none text-slate-800 ${isGenerating ? "opacity-50" : ""}`}
              rows={3} />
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button onClick={() => setAiOpen(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2">Dismiss</button>
              <button disabled={isGenerating || !aiInput.trim()} onClick={handleGenerate}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm min-w-[140px]
                  ${isGenerating ? "bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-black active:scale-95 shadow-sm"}`}>
                <div className="relative z-10 flex items-center gap-2">
                  {isGenerating ? (<><span>Refining</span><div className="flex gap-1"><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" /><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" /><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" /></div></>) :
                   (<><span>Improve</span><Send size={16} className="opacity-70" /></>)}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
