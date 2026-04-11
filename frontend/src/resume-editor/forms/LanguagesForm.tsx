import { FormField, FormRow, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

const EMPTY = { language: "", fluency: "" };

export function LanguagesForm({
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
    <SectionCard title="Languages" defaultOpen={false}>
      <ArraySection
        label="Language"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <FormRow>
            <FormField label="Language" value={getStr(entry, "language")} onChange={(v) => update(i, "language", v)} placeholder="English" />
            <FormField label="Fluency" value={getStr(entry, "fluency")} onChange={(v) => update(i, "fluency", v)} placeholder="Native, Fluent..." />
          </FormRow>
        )}
      />
    </SectionCard>
  );
}
