import { Check, XIcon } from "lucide-react";

export function ReviewBar({
  onAccept,
  onDiscard,
  sectionLabel,
}: {
  onAccept: () => void;
  onDiscard: () => void;
  sectionLabel: string;
}) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-6">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Reviewing Changes
          </span>
          <span className="text-sm font-medium">Refined {sectionLabel}</span>
        </div>

        <div className="h-8 w-[1px] bg-slate-700" />

        <div className="flex gap-2">
          <button
            onClick={onDiscard}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-slate-800 rounded-xl transition-colors text-slate-300"
          >
            <XIcon size={16} />
            Discard
          </button>
          <button
            onClick={onAccept}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-xl transition-all active:scale-95"
          >
            <Check size={16} />
            Accept Changes
          </button>
        </div>
      </div>
    </div>
  );
}
