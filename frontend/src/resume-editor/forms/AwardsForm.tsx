import { FormField, FormRow, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

const EMPTY = { title: "", date: "", awarder: "", summary: "" };

export function AwardsForm({
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
    <SectionCard title="Awards" defaultOpen={false}>
      <ArraySection
        label="Award"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Title" value={getStr(entry, "title")} onChange={(v) => update(i, "title", v)} placeholder="Best Paper Award" />
              <FormField label="Awarder" value={getStr(entry, "awarder")} onChange={(v) => update(i, "awarder", v)} placeholder="IEEE" />
            </FormRow>
            <FormField label="Date" value={getStr(entry, "date")} onChange={(v) => update(i, "date", v)} placeholder="2023-06" />
            <FormField label="Summary" value={getStr(entry, "summary")} onChange={(v) => update(i, "summary", v)} placeholder="Details about the award..." multiline />
          </div>
        )}
      />
    </SectionCard>
  );
}
