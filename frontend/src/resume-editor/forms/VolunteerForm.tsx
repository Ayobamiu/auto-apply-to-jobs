import { FormField, FormRow, SectionCard, ArraySection, HighlightsList } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY = {
  organization: "", position: "", url: "",
  startDate: "", endDate: "", summary: "", highlights: [],
};

export function VolunteerForm({
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
    <SectionCard title="Volunteer" defaultOpen={false}>
      <ArraySection
        label="Volunteer"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Position" value={getStr(entry, "position")} onChange={(v) => update(i, "position", v)} placeholder="Volunteer Coordinator" />
              <FormField label="Organization" value={getStr(entry, "organization")} onChange={(v) => update(i, "organization", v)} placeholder="Red Cross" />
            </FormRow>
            <FormRow>
              <FormField label="Start Date" value={getStr(entry, "startDate")} onChange={(v) => update(i, "startDate", v)} placeholder="2020-01" />
              <FormField label="End Date" value={getStr(entry, "endDate")} onChange={(v) => update(i, "endDate", v)} placeholder="2021-12" />
            </FormRow>
            <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://organization.org" />
            <FormField label="Summary" value={getStr(entry, "summary")} onChange={(v) => update(i, "summary", v)} placeholder="Description of role..." multiline />
            <HighlightsList items={getArr(entry, "highlights")} onChange={(v) => update(i, "highlights", v)} />
          </div>
        )}
      />
    </SectionCard>
  );
}
