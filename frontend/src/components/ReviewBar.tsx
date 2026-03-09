import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import type { ProposedPatch } from "../resume-editor/utils";
import { pathToReviewLabel } from "../resume-editor/utils";

export function ReviewBar({
  patches,
  onAcceptOne,
  onAcceptAll,
  onDiscardOne,
  onDiscardAll,
}: {
  patches: ProposedPatch[];
  onAcceptOne: (index: number) => void;
  onAcceptAll: () => void;
  onDiscardOne: (index: number) => void;
  onDiscardAll: () => void;
}) {
  const [viewIndex, setViewIndex] = useState(0);
  const idx = Math.min(viewIndex, patches.length - 1);
  const current = patches[idx];
  if (!current) return null;

  const total = patches.length;
  const opVerb = current.op === "add" ? "Add" : current.op === "remove" ? "Remove" : "Update";
  const label = pathToReviewLabel(current.path);

  const prev = () => setViewIndex((idx - 1 + total) % total);
  const next = () => setViewIndex((idx + 1) % total);
  const handleAccept = () => {
    onAcceptOne(idx);
    if (idx >= total - 1) setViewIndex(Math.max(0, idx - 1));
  };
  const handleDiscard = () => {
    onDiscardOne(idx);
    if (idx >= total - 1) setViewIndex(Math.max(0, idx - 1));
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4">
        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          {total > 1 && (
            <button onClick={prev} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronLeft size={16} />
            </button>
          )}
          <div className="flex flex-col min-w-[100px]">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              {total > 1 ? `Change ${idx + 1} of ${total}` : "Reviewing Change"}
            </span>
            <span className="text-sm font-medium">{opVerb} {label}</span>
          </div>
          {total > 1 && (
            <button onClick={next} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        <div className="h-8 w-[1px] bg-slate-700" />

        {/* Per-patch actions */}
        <div className="flex gap-2">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium hover:bg-slate-800 rounded-xl transition-colors text-slate-300"
          >
            <XIcon size={14} />
            Discard
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-xl transition-all active:scale-95"
          >
            <Check size={14} />
            Accept
          </button>
        </div>

        {/* Bulk actions (only when > 1 patch) */}
        {total > 1 && (
          <>
            <div className="h-8 w-[1px] bg-slate-700" />
            <div className="flex gap-2">
              <button
                onClick={onDiscardAll}
                className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors px-2 py-1"
              >
                Discard All
              </button>
              <button
                onClick={onAcceptAll}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1"
              >
                Accept All ({total})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
