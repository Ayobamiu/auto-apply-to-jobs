import { FormField, FormRow, SectionCard, ArraySection, TagInput } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY = { name: "", level: "", keywords: [] };

export function SkillsForm({
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
    <SectionCard title="Skills">
      <ArraySection
        label="Skill"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Category" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="Web Development" />
              <FormField label="Level" value={getStr(entry, "level")} onChange={(v) => update(i, "level", v)} placeholder="Expert, Intermediate..." />
            </FormRow>
            <TagInput label="Keywords" tags={getArr(entry, "keywords")} onChange={(v) => update(i, "keywords", v)} placeholder="Add skill..." />
          </div>
        )}
      />
    </SectionCard>
  );
}
