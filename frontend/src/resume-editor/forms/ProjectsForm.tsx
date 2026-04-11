import { FormField, FormRow, SectionCard, ArraySection, HighlightsList, TagInput } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY = {
  name: "", description: "", highlights: [], keywords: [],
  startDate: "", endDate: "", url: "", roles: [], entity: "", type: "",
};

export function ProjectsForm({
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
    <SectionCard title="Projects">
      <ArraySection
        label="Project"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Name" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Project name" />
              <FormField label="Entity" value={getStr(entry, "entity")} onChange={(v) => update(i, "entity", v)} placeholder="Company / Org" />
            </FormRow>
            <FormField label="Description" value={getStr(entry, "description")} onChange={(v) => update(i, "description", v)} placeholder="Brief description..." multiline />
            <FormRow>
              <FormField label="Start Date" value={getStr(entry, "startDate")} onChange={(v) => update(i, "startDate", v)} placeholder="2022-01" />
              <FormField label="End Date" value={getStr(entry, "endDate")} onChange={(v) => update(i, "endDate", v)} placeholder="2022-12" />
            </FormRow>
            <FormRow>
              <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://project.com" />
              <FormField label="Type" value={getStr(entry, "type")} onChange={(v) => update(i, "type", v)} placeholder="application, talk, etc." />
            </FormRow>
            <TagInput label="Keywords" tags={getArr(entry, "keywords")} onChange={(v) => update(i, "keywords", v)} placeholder="Add keyword..." />
            <TagInput label="Roles" tags={getArr(entry, "roles")} onChange={(v) => update(i, "roles", v)} placeholder="Add role..." />
            <HighlightsList items={getArr(entry, "highlights")} onChange={(v) => update(i, "highlights", v)} />
          </div>
        )}
      />
    </SectionCard>
  );
}
