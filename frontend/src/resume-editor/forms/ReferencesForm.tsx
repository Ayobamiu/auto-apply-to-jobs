import { FormField, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

const EMPTY = { name: "", reference: "" };

export function ReferencesForm({
  items,
  onChange,
}: {
  items: Record<string, unknown>[];
  onChange: (items: Record<string, unknown>[]) => void;
}) {
  const update = (i: number, key: string, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  };

  return (
    <SectionCard title="References" defaultOpen={false}>
      <ArraySection
        label="Reference"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormField label="Name" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Timothy Cook" />
            <FormField label="Reference" value={getStr(entry, "reference")} onChange={(v) => update(i, "reference", v)} placeholder="Reference text..." multiline />
          </div>
        )}
      />
    </SectionCard>
  );
}
