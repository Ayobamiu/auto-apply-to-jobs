import { FormField, FormRow, SectionCard, ArraySection } from "./shared";

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj?.[key];
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function getArr(obj: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = obj?.[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export function BasicsForm({
  basics,
  onChange,
}: {
  basics: Record<string, unknown>;
  onChange: (basics: Record<string, unknown>) => void;
}) {
  const location = getObj(basics, "location");
  const profiles = getArr(basics, "profiles");

  const set = (key: string, value: unknown) =>
    onChange({ ...basics, [key]: value });
  const setLocation = (key: string, value: string) =>
    onChange({ ...basics, location: { ...location, [key]: value } });

  return (
    <SectionCard title="Personal Info">
      <FormRow>
        <FormField label="Full Name" value={getStr(basics, "name")} onChange={(v) => set("name", v)} placeholder="John Doe" />
        <FormField label="Title / Label" value={getStr(basics, "label")} onChange={(v) => set("label", v)} placeholder="e.g. Software Engineer" />
      </FormRow>
      <FormRow>
        <FormField label="Email" value={getStr(basics, "email")} onChange={(v) => set("email", v)} placeholder="john@example.com" type="email" />
        <FormField label="Phone" value={getStr(basics, "phone")} onChange={(v) => set("phone", v)} placeholder="(555) 123-4567" type="tel" />
      </FormRow>
      <FormRow>
        <FormField label="Website" value={getStr(basics, "url")} onChange={(v) => set("url", v)} placeholder="https://yoursite.com" />
        <FormField label="Image URL" value={getStr(basics, "image")} onChange={(v) => set("image", v)} placeholder="https://..." />
      </FormRow>
      <FormField label="Summary" value={getStr(basics, "summary")} onChange={(v) => set("summary", v)} placeholder="A brief professional summary..." multiline />

      <div className="border-t border-gray-200 pt-3 mt-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Location</p>
        <FormRow>
          <FormField label="City" value={getStr(location, "city")} onChange={(v) => setLocation("city", v)} placeholder="San Francisco" />
          <FormField label="Region / State" value={getStr(location, "region")} onChange={(v) => setLocation("region", v)} placeholder="CA" />
        </FormRow>
        <div className="mt-3">
          <FormRow>
            <FormField label="Country Code" value={getStr(location, "countryCode")} onChange={(v) => setLocation("countryCode", v)} placeholder="US" />
            <FormField label="Postal Code" value={getStr(location, "postalCode")} onChange={(v) => setLocation("postalCode", v)} placeholder="94105" />
          </FormRow>
        </div>
        <div className="mt-3">
          <FormField label="Address" value={getStr(location, "address")} onChange={(v) => setLocation("address", v)} placeholder="123 Main St" multiline />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-3 mt-1">
        <ArraySection
          label="Profile"
          items={profiles}
          onAdd={() => onChange({ ...basics, profiles: [...profiles, { network: "", username: "", url: "" }] })}
          onRemove={(i) => onChange({ ...basics, profiles: profiles.filter((_, j) => j !== i) })}
          renderItem={(p, i) => (
            <div className="flex flex-col gap-2">
              <FormRow>
                <FormField label="Network" value={getStr(p, "network")} onChange={(v) => {
                  const next = [...profiles];
                  next[i] = { ...p, network: v };
                  onChange({ ...basics, profiles: next });
                }} placeholder="LinkedIn" />
                <FormField label="Username" value={getStr(p, "username")} onChange={(v) => {
                  const next = [...profiles];
                  next[i] = { ...p, username: v };
                  onChange({ ...basics, profiles: next });
                }} placeholder="johndoe" />
              </FormRow>
              <FormField label="URL" value={getStr(p, "url")} onChange={(v) => {
                const next = [...profiles];
                next[i] = { ...p, url: v };
                onChange({ ...basics, profiles: next });
              }} placeholder="https://linkedin.com/in/johndoe" />
            </div>
          )}
        />
      </div>
    </SectionCard>
  );
}
