import { useState, useCallback, useEffect, useMemo } from "react";
import { ResumeDocument } from "./ResumeDocument";
import {
  Check,
  Send,
  Sparkles,
  ArrowLeft,
  Eye,
  Pencil,
  Download,
  Undo2,
  Redo2,
} from "lucide-react";
import { useAiEditor } from "../hooks/useAiEditor";
import { ReviewBar } from "../components/ReviewBar";
import {
  downloadPipelineArtifactPdf,
  getPipelineJobStatus,
  postResumeUpdate,
  putPipelineArtifactResume,
} from "../api";
import { Spin } from "antd";

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
        if (raw) {
          const p = JSON.parse(raw);
          if (p && typeof p === "object") return p as Record<string, unknown>;
        }
      } catch {}
    }
    return {} as Record<string, unknown>;
  }, [externalResume, standalone]);

  const [lastSavedResume, setLastSavedResume] =
    useState<Record<string, unknown>>(initial);

  useEffect(() => {
    // When the initial resume source changes (e.g., new job or standalone load),
    // treat that as the new saved baseline.
    setLastSavedResume(initial);
  }, [initial]);

  const persistResume = useCallback(
    async (next: Record<string, unknown>) => {
      if (standalone) {
        try {
          localStorage.setItem(STANDALONE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors for standalone mode
        }
      }
      try {
        if (jobId) {
          await putPipelineArtifactResume(jobId, next);
        }
        externalOnSave?.(next);
        setLastSavedResume(next);
      } catch (err) {
        // surface to console for now; UI remains responsive because state is local
        console.error("Failed to save resume", err);
      }
    },
    [standalone, jobId, externalOnSave],
  );

  const {
    resume,
    previewResume,
    proposedPatches,
    handleAiUpdate,
    setResume,
    resetResume,
    commitOne,
    commitAll,
    discardOne,
    discardAll,
    isSuccess,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAiEditor({ initialResume: initial, onSave: persistResume });

  useEffect(() => {
    if (externalResume && externalResume !== initial) {
      resetResume(externalResume);
      setLastSavedResume(externalResume);
    }
  }, [externalResume, initial, resetResume]);

  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedNode, setSelectedNode] = useState<
    | {
        path: string;
        label: string;
        data: string;
        type: "block" | "highlight";
      }
    | null
    | undefined
  >(null);

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
          if (submitted) return; // stop polling once submitted
        }
      } catch {
        // ignore (don't block preview)
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
    // Force preview mode and close assistant when submitted.
    setMode("preview");
    setAiOpen(false);
    setSelectedNode(null);
  }, [isSubmitted]);

  useEffect(() => {
    if (selectedNode?.type === "highlight") setAiOpen(true);
  }, [selectedNode]);

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSubmitted) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo, isSubmitted]);

  const handleGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const response = await postResumeUpdate(resume, aiInput, {
        jobDescription,
        editHistory,
      });
      await handleAiUpdate({ patches: response });
      setAiOpen(false);
    } catch (err) {
      console.error("AI update failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const hasPatches = proposedPatches.length > 0;

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(resume) !== JSON.stringify(lastSavedResume),
    [resume, lastSavedResume],
  );

  const handleSaveClick = useCallback(async () => {
    if (isSubmitted || !hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      await persistResume(resume);
    } finally {
      setIsSaving(false);
    }
  }, [isSubmitted, hasUnsavedChanges, persistResume, resume]);

  const [downloadingResume, setDownloadingResume] = useState(false);

  const handleDownloadResume = useCallback(async () => {
    if (!jobId) return void window.print();
    setDownloadingResume(true);
    try {
      await downloadPipelineArtifactPdf(jobId, "resume");
    } catch (err) {
      console.error("Failed to download resume", err);
    } finally {
      setDownloadingResume(false);
    }
  }, [jobId]);

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {/* Top bar */}
      {onBack && (
        <div className="no-print flex items-center gap-3 px-4 py-2 border-b border-slate-100">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
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
              title={
                isSubmitted
                  ? "This job has been submitted. Editing is disabled."
                  : undefined
              }
            >
              {mode === "edit" ? (
                <>
                  <Eye size={14} /> Preview
                </>
              ) : (
                <>
                  <Pencil size={14} /> Edit
                </>
              )}
            </button>
            {!isSubmitted && (
              <>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 size={14} />
                </button>
              </>
            )}
            {mode === "preview" && (
              <button
                onClick={handleDownloadResume}
                disabled={downloadingResume}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <Download size={14} /> PDF{" "}
                <Spin size="small" spinning={downloadingResume} />
              </button>
            )}
            {hasUnsavedChanges && (
              <button
                onClick={handleSaveClick}
                disabled={isSubmitted || isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-900 text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={`flex-1 overflow-auto px-4 py-4 md:max-w-3xl md:mx-auto md:px-6 md:py-5 w-full ${hasPatches ? "pb-24" : ""}`}
      >
        <ResumeDocument
          resume={hasPatches ? previewResume : resume}
          baseResume={hasPatches ? resume : undefined}
          onChange={setResume}
          compact={mode === "preview"}
          readOnly={mode === "preview"}
          disableSelection={isSubmitted}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
        />
        {hasPatches && (
          <ReviewBar
            patches={proposedPatches}
            onAcceptOne={commitOne}
            onAcceptAll={commitAll}
            onDiscardOne={discardOne}
            onDiscardAll={discardAll}
          />
        )}
      </div>

      {/* Floating buttons (standalone mode only) */}
      {!onBack && (
        <div className="no-print fixed bottom-6 right-6 z-10 flex items-center gap-3">
          {mode === "preview" && (
            <button
              type="button"
              onClick={handleDownloadResume}
              disabled={downloadingResume}
              className="h-14 px-6 flex items-center gap-2 rounded-full bg-white text-slate-700 border border-slate-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95 group"
            >
              <Download
                size={20}
                className="shrink-0 text-slate-500 group-hover:text-slate-900"
              />
              <span className="hidden lg:block font-semibold text-sm text-slate-600 group-hover:text-slate-900">
                Download PDF
              </span>
              <Spin size="small" spinning={downloadingResume} />
            </button>
          )}
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={isSubmitted || isSaving}
              className="h-14 px-6 flex items-center gap-2 rounded-full bg-white text-slate-700 border border-slate-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isSubmitted) return;
              setMode((m) => (m === "edit" ? "preview" : "edit"));
            }}
            disabled={isSubmitted}
            className="h-14 px-6 flex items-center gap-2 rounded-full bg-slate-900 text-white shadow-lg transition-all hover:bg-black hover:shadow-xl hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            title={
              isSubmitted
                ? "This job has been submitted. Editing is disabled."
                : undefined
            }
          >
            {mode === "edit" ? (
              <>
                <Eye size={20} />
                <span className="hidden lg:block font-semibold text-sm">
                  Preview
                </span>
              </>
            ) : (
              <>
                <Pencil size={20} />
                <span className="hidden lg:block font-semibold text-sm">
                  Edit
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* AI Assistant */}
      <div
        className={`no-print fixed lg:left-1/2 left-6 lg:-translate-x-1/2 z-40 transition-[bottom] duration-200 ${hasPatches ? "bottom-24" : "bottom-6"}`}
      >
        {!aiOpen && !isSubmitted && (
          <button
            onClick={() => {
              setAiOpen(true);
              setMode("preview");
            }}
            className="group relative h-14 px-8 flex items-center gap-3 rounded-full bg-[#0f172a] text-white overflow-hidden transition-all hover:ring-2 hover:ring-slate-400 hover:ring-offset-2 hover:ring-offset-white"
          >
            <Sparkles
              size={20}
              className="text-amber-300 transition-transform group-hover:rotate-12"
            />
            <span className="text-sm font-semibold tracking-tight">
              Ask Assistant
            </span>
          </button>
        )}
      </div>
      <div className="no-print fixed lg:bottom-6 bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-200">
        {aiOpen && !isSubmitted && (
          <div className="flex flex-col gap-3 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-4 border border-slate-200/50 w-[440px] max-w-[95vw] animate-in fade-in zoom-in-95 duration-200">
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
              onKeyDown={handleKeyDown}
              placeholder="Try: 'Make my bullet points more action-oriented'..."
              disabled={isGenerating}
              className={`w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent placeholder:text-slate-400 resize-none text-slate-800 transition-opacity ${isGenerating ? "opacity-50" : ""}`}
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
                  ${!isGenerating && !isSuccess ? "bg-slate-900 text-white hover:bg-black active:scale-95 shadow-sm" : ""}`}
              >
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
                      <span>Updated</span>
                    </>
                  ) : isGenerating ? (
                    <>
                      <span>Refining</span>
                      <div className="flex gap-1">
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" />
                      </div>
                    </>
                  ) : (
                    <>
                      <span>
                        {selectedNode
                          ? `Improve "${selectedNode.label.slice(0, 10)}..."`
                          : "Generate"}
                      </span>
                      <Send size={16} className="opacity-70" />
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
