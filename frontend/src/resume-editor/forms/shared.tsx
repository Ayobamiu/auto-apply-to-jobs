import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical } from "lucide-react";

const fieldBase =
  "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors bg-white";

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  const [local, setLocal] = useState(value);

  // Sync when external value changes (e.g. undo/redo)
  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed !== value) onChange(trimmed);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          rows={3}
          className={fieldBase + " resize-y"}
        />
      ) : (
        <input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder={placeholder}
          className={fieldBase}
        />
      )}
    </div>
  );
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function TagInput({
  label,
  tags,
  onChange,
  placeholder = "Type and press Enter",
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border border-gray-300 rounded-lg bg-white">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full border border-slate-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="hover:text-rose-600 transition-colors"
            >
              <Trash2 size={10} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
            if (e.key === "Backspace" && !input && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={addTag}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[100px] text-sm outline-none bg-transparent"
        />
      </div>
    </div>
  );
}

export function ArraySection<T>({
  label,
  items,
  onAdd,
  onRemove,
  onMove,
  renderItem,
  emptyLabel = "None yet",
}: {
  label: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove?: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">{emptyLabel}</p>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          className="relative border border-gray-200 rounded-lg p-3 bg-white group"
        >
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onMove && i > 0 && (
              <button
                type="button"
                onClick={() => onMove(i, i - 1)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
                title="Move up"
              >
                <GripVertical size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="p-1 text-gray-400 hover:text-rose-600 rounded"
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {renderItem(item, i)}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium py-1.5"
      >
        <Plus size={14} /> Add {label}
      </button>
    </div>
  );
}

function HighlightItem({
  value,
  onCommit,
  onRemove,
}: {
  value: string;
  onCommit: (v: string) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="flex gap-1.5 items-start">
      <span className="text-gray-400 mt-2 text-xs">&#8226;</span>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onCommit(local); }}
        rows={2}
        className={fieldBase + " flex-1 resize-y"}
        placeholder="Describe an accomplishment..."
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors mt-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function HighlightsList({
  items,
  onChange,
  label = "Highlights",
}: {
  items: string[];
  onChange: (items: string[]) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      {items.map((h, i) => (
        <HighlightItem
          key={i}
          value={h}
          onCommit={(v) => {
            const next = [...items];
            next[i] = v;
            onChange(next);
          }}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
      >
        <Plus size={14} /> Add {label.toLowerCase()}
      </button>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100 transition-colors"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
