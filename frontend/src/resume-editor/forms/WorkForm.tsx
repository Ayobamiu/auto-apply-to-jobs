import { FormField, FormRow, SectionCard, ArraySection, HighlightsList } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY_WORK = {
  name: "", location: "", description: "", position: "", url: "",
  startDate: "", endDate: "", summary: "", highlights: [],
};

export function WorkForm({
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

  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <SectionCard title="Experience">
      <ArraySection
        label="Experience"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY_WORK }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        onMove={move}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Position" value={getStr(entry, "position")} onChange={(v) => update(i, "position", v)} placeholder="Software Engineer" />
              <FormField label="Company" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Acme Inc." />
            </FormRow>
            <FormRow>
              <FormField label="Location" value={getStr(entry, "location")} onChange={(v) => update(i, "location", v)} placeholder="San Francisco, CA" />
              <FormField label="Description" value={getStr(entry, "description")} onChange={(v) => update(i, "description", v)} placeholder="Tech company" />
            </FormRow>
            <FormRow>
              <FormField label="Start Date" value={getStr(entry, "startDate")} onChange={(v) => update(i, "startDate", v)} placeholder="2020-01" />
              <FormField label="End Date" value={getStr(entry, "endDate")} onChange={(v) => update(i, "endDate", v)} placeholder="2023-06 (or leave empty for Present)" />
            </FormRow>
            <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://company.com" />
            <FormField label="Summary" value={getStr(entry, "summary")} onChange={(v) => update(i, "summary", v)} placeholder="Overview of role..." multiline />
            <HighlightsList items={getArr(entry, "highlights")} onChange={(v) => update(i, "highlights", v)} />
          </div>
        )}
      />
    </SectionCard>
  );
}
