import { FormField, FormRow, SectionCard, ArraySection, TagInput } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

const EMPTY = {
  institution: "", url: "", area: "", studyType: "",
  startDate: "", endDate: "", score: "", courses: [],
};

export function EducationForm({
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
    <SectionCard title="Education">
      <ArraySection
        label="Education"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Institution" value={getStr(entry, "institution")} onChange={(v) => update(i, "institution", v)} placeholder="MIT" />
              <FormField label="Area / Major" value={getStr(entry, "area")} onChange={(v) => update(i, "area", v)} placeholder="Computer Science" />
            </FormRow>
            <FormRow>
              <FormField label="Degree Type" value={getStr(entry, "studyType")} onChange={(v) => update(i, "studyType", v)} placeholder="Bachelor" />
              <FormField label="Score / GPA" value={getStr(entry, "score")} onChange={(v) => update(i, "score", v)} placeholder="3.8/4.0" />
            </FormRow>
            <FormRow>
              <FormField label="Start Date" value={getStr(entry, "startDate")} onChange={(v) => update(i, "startDate", v)} placeholder="2016-09" />
              <FormField label="End Date" value={getStr(entry, "endDate")} onChange={(v) => update(i, "endDate", v)} placeholder="2020-05" />
            </FormRow>
            <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://university.edu" />
            <TagInput label="Courses" tags={getArr(entry, "courses")} onChange={(v) => update(i, "courses", v)} placeholder="Add a course..." />
          </div>
        )}
      />
    </SectionCard>
  );
}
