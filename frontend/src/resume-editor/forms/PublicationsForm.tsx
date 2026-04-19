import { FormField, FormRow, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

const EMPTY = { name: "", publisher: "", releaseDate: "", url: "", summary: "" };

export function PublicationsForm({
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
    <SectionCard title="Publications" defaultOpen={false}>
      <ArraySection
        label="Publication"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Name" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Paper title" />
              <FormField label="Publisher" value={getStr(entry, "publisher")} onChange={(v) => update(i, "publisher", v)} placeholder="IEEE, ACM..." />
            </FormRow>
            <FormRow>
              <FormField label="Release Date" value={getStr(entry, "releaseDate")} onChange={(v) => update(i, "releaseDate", v)} placeholder="2023-03" />
              <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://..." />
            </FormRow>
            <FormField label="Summary" value={getStr(entry, "summary")} onChange={(v) => update(i, "summary", v)} placeholder="Brief summary..." multiline />
          </div>
        )}
      />
    </SectionCard>
  );
}
