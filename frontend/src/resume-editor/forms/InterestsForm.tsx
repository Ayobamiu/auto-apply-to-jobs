import { FormField, SectionCard, ArraySection, TagInput } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY = { name: "", keywords: [] };

export function InterestsForm({
  items,
  onChange,
}: {
  items: Record<string, unknown>[];
  onChange: (items: Record<string, unknown>[]) => void;
}) {
  const update = (i: number, key: string, value: unknown) => {
    const next = [...items];
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  };

  return (
    <SectionCard title="Interests" defaultOpen={false}>
      <ArraySection
        label="Interest"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormField label="Name" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Philosophy" />
            <TagInput label="Keywords" tags={getArr(entry, "keywords")} onChange={(v) => update(i, "keywords", v)} placeholder="Add keyword..." />
          </div>
        )}
      />
    </SectionCard>
  );
}
