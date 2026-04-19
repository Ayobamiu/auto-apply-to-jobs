import { FormField, FormRow, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

const EMPTY = { name: "", date: "", url: "", issuer: "" };

export function CertificatesForm({
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
    <SectionCard title="Certificates" defaultOpen={false}>
      <ArraySection
        label="Certificate"
        items={items}
        onAdd={() => onChange([...items, { ...EMPTY }])}
        onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
        renderItem={(entry, i) => (
          <div className="flex flex-col gap-2">
            <FormRow>
              <FormField label="Name" value={getStr(entry, "name")} onChange={(v) => update(i, "name", v)} placeholder="AWS Solutions Architect" />
              <FormField label="Issuer" value={getStr(entry, "issuer")} onChange={(v) => update(i, "issuer", v)} placeholder="Amazon" />
            </FormRow>
            <FormRow>
              <FormField label="Date" value={getStr(entry, "date")} onChange={(v) => update(i, "date", v)} placeholder="2023-01" />
              <FormField label="URL" value={getStr(entry, "url")} onChange={(v) => update(i, "url", v)} placeholder="https://..." />
            </FormRow>
          </div>
        )}
      />
    </SectionCard>
  );
}
