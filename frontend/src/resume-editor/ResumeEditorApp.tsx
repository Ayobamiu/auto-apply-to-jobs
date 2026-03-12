import { useState, useCallback, useEffect, useMemo } from "react";
import { ResumeDocument } from "./ResumeDocument";
import { Check, Send, Sparkles, ArrowLeft, Eye, Pencil, Download } from "lucide-react";
import { useAiEditor } from "../hooks/useAiEditor";
import { ReviewBar } from "../components/ReviewBar";
import { postResumeUpdate, putPipelineArtifactResume } from "../api";

const STANDALONE_KEY = "auto-apply-resume-editor-draft";

export interface ResumeEditorAppProps {
  initialResume?: Record<string, unknown>;
  jobId?: string;
  jobDescription?: string;
  editHistory?: string[];
  onSave?: (resume: Record<string, unknown>) => void;
  onBack?: () => void;
  standalone?: boolean;
}

export function ResumeEditorApp({
  initialResume: externalResume,
  jobId,
  jobDescription,
  editHistory,
  onSave: externalOnSave,
  onBack,
  standalone = false,
}: ResumeEditorAppProps = {}) {
  const initial = useMemo(() => {
    if (externalResume) return externalResume;
    if (standalone) {
      try {
        const raw = localStorage.getItem(STANDALONE_KEY);
        if (raw) { const p = JSON.parse(raw); if (p && typeof p === "object") return p as Record<string, unknown>; }
      } catch {}
    }
    return {} as Record<string, unknown>;
  }, [externalResume, standalone]);

  const handleSave = useCallback((next: Record<string, unknown>) => {
    if (standalone) {
      try { localStorage.setItem(STANDALONE_KEY, JSON.stringify(next)); } catch {}
    }
    if (jobId) {
      putPipelineArtifactResume(jobId, next).catch(console.error);
    }
    externalOnSave?.(next);
  }, [standalone, jobId, externalOnSave]);

  const {
    resume, proposedPatches, handleAiUpdate, setResume, resetResume,
    commitOne, commitAll, discardOne, discardAll, isSuccess,
  } = useAiEditor({ initialResume: initial, onSave: handleSave });

  useEffect(() => {
    if (externalResume && externalResume !== initial) resetResume(externalResume);
  }, [externalResume]);

  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [selectedNode, setSelectedNode] = useState<{
    path: string; label: string; data: string; type: "block" | "highlight";
  } | null | undefined>(null);

  useEffect(() => {
    if (selectedNode?.type === "highlight") setAiOpen(true);
  }, [selectedNode]);

  const handleGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const response = await postResumeUpdate(resume, aiInput, { jobDescription, editHistory });
      await handleAiUpdate({ patches: response });
      setAiOpen(false);
    } catch (err) { console.error("AI update failed:", err); }
    finally { setIsGenerating(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  };

  const hasPatches = proposedPatches.length > 0;

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {/* Top bar */}
      {onBack && (
        <div className="no-print flex items-center gap-3 px-4 py-2 border-b border-slate-100">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setMode(m => m === "edit" ? "preview" : "edit")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50">
              {mode === "edit" ? <><Eye size={14} /> Preview</> : <><Pencil size={14} /> Edit</>}
            </button>
            {mode === "preview" && (
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50">
                <Download size={14} /> PDF
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-auto px-4 py-4 md:max-w-3xl md:mx-auto md:px-6 md:py-5 w-full ${hasPatches ? "pb-24" : ""}`}>
        <ResumeDocument
          resume={resume}
          onChange={handleSave}
          compact={mode === "preview"}
          readOnly={mode === "preview"}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          proposedPatches={proposedPatches}
        />
        {hasPatches && (
          <ReviewBar patches={proposedPatches} onAcceptOne={commitOne} onAcceptAll={commitAll} onDiscardOne={discardOne} onDiscardAll={discardAll} />
        )}
      </div>

      {/* Floating buttons (standalone mode only) */}
      {!onBack && (
        <div className="no-print fixed bottom-6 right-6 z-10 flex items-center gap-3">
          {mode === "preview" && (
            <button type="button" onClick={() => window.print()}
              className="h-14 px-6 flex items-center gap-2 rounded-full bg-white text-slate-700 border border-slate-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95 group">
              <Download size={20} className="shrink-0 text-slate-500 group-hover:text-slate-900" />
              <span className="hidden lg:block font-semibold text-sm text-slate-600 group-hover:text-slate-900">Download PDF</span>
            </button>
          )}
          <button type="button" onClick={() => setMode(m => m === "edit" ? "preview" : "edit")}
            className="h-14 px-6 flex items-center gap-2 rounded-full bg-slate-900 text-white shadow-lg transition-all hover:bg-black hover:shadow-xl hover:-translate-y-0.5 active:scale-95">
            {mode === "edit" ? <><Eye size={20} /><span className="hidden lg:block font-semibold text-sm">Preview</span></> : <><Pencil size={20} /><span className="hidden lg:block font-semibold text-sm">Edit</span></>}
          </button>
        </div>
      )}

      {/* AI Assistant */}
      <div className={`no-print fixed lg:left-1/2 left-6 lg:-translate-x-1/2 z-40 transition-[bottom] duration-200 ${hasPatches ? "bottom-24" : "bottom-6"}`}>
        {!aiOpen && (
          <button onClick={() => { setAiOpen(true); setMode("preview"); }}
            className="group relative h-14 px-8 flex items-center gap-3 rounded-full bg-[#0f172a] text-white overflow-hidden transition-all hover:ring-2 hover:ring-slate-400 hover:ring-offset-2 hover:ring-offset-white">
            <Sparkles size={20} className="text-amber-300 transition-transform group-hover:rotate-12" />
            <span className="text-sm font-semibold tracking-tight">Ask Assistant</span>
          </button>
        )}
      </div>
      <div className="no-print fixed lg:bottom-6 bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-200">
        {aiOpen && (
          <div className="flex flex-col gap-3 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-4 border border-slate-200/50 w-[440px] max-w-[95vw] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 px-1 text-slate-500">
              <Sparkles size={14} />
              <span className="text-[11px] uppercase tracking-widest font-bold">Resume Intelligence</span>
            </div>
            <textarea autoFocus value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Try: 'Make my bullet points more action-oriented'..."
              disabled={isGenerating}
              className={`w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent placeholder:text-slate-400 resize-none text-slate-800 transition-opacity ${isGenerating ? "opacity-50" : ""}`}
              rows={3} />
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button onClick={() => setAiOpen(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2">Dismiss</button>
              <button disabled={isGenerating || isSuccess || !aiInput.trim()} onClick={handleGenerate}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-500 font-medium text-sm overflow-hidden min-w-[140px]
                  ${isGenerating ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
                  ${isSuccess ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : ""}
                  ${!isGenerating && !isSuccess ? "bg-slate-900 text-white hover:bg-black active:scale-95 shadow-sm" : ""}`}>
                {isGenerating && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 to-transparent -translate-x-full animate-shimmer" />}
                <div className="relative z-10 flex items-center gap-2">
                  {isSuccess ? (<><Check size={18} className="animate-in zoom-in duration-300" /><span>Updated</span></>) :
                   isGenerating ? (<><span>Refining</span><div className="flex gap-1"><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" /><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" /><span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" /></div></>) :
                   (<><span>{selectedNode ? `Improve "${selectedNode.label.slice(0, 10)}..."` : "Generate"}</span><Send size={16} className="opacity-70" /></>)}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
