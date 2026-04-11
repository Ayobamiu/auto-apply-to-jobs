import { BasicsForm } from "./BasicsForm";
import { WorkForm } from "./WorkForm";
import { EducationForm } from "./EducationForm";
import { VolunteerForm } from "./VolunteerForm";
import { ProjectsForm } from "./ProjectsForm";
import { SkillsForm } from "./SkillsForm";
import { LanguagesForm } from "./LanguagesForm";
import { CertificatesForm } from "./CertificatesForm";
import { AwardsForm } from "./AwardsForm";
import { PublicationsForm } from "./PublicationsForm";
import { InterestsForm } from "./InterestsForm";
import { ReferencesForm } from "./ReferencesForm";

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

export function ResumeEditForm({
  resume,
  onChange,
}: {
  resume: Record<string, unknown>;
  onChange: (resume: Record<string, unknown>) => void;
}) {
  const setSection = (key: string, value: unknown) =>
    onChange({ ...resume, [key]: value });

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto pb-8">
      <BasicsForm
        basics={getObj(resume, "basics")}
        onChange={(v) => setSection("basics", v)}
      />
      <WorkForm
        items={getArr(resume, "work")}
        onChange={(v) => setSection("work", v)}
      />
      <EducationForm
        items={getArr(resume, "education")}
        onChange={(v) => setSection("education", v)}
      />
      <ProjectsForm
        items={getArr(resume, "projects")}
        onChange={(v) => setSection("projects", v)}
      />
      <SkillsForm
        items={getArr(resume, "skills")}
        onChange={(v) => setSection("skills", v)}
      />
      <VolunteerForm
        items={getArr(resume, "volunteer")}
        onChange={(v) => setSection("volunteer", v)}
      />
      <LanguagesForm
        items={getArr(resume, "languages")}
        onChange={(v) => setSection("languages", v)}
      />
      <CertificatesForm
        items={getArr(resume, "certificates")}
        onChange={(v) => setSection("certificates", v)}
      />
      <AwardsForm
        items={getArr(resume, "awards")}
        onChange={(v) => setSection("awards", v)}
      />
      <PublicationsForm
        items={getArr(resume, "publications")}
        onChange={(v) => setSection("publications", v)}
      />
      <InterestsForm
        items={getArr(resume, "interests")}
        onChange={(v) => setSection("interests", v)}
      />
      <ReferencesForm
        items={getArr(resume, "references")}
        onChange={(v) => setSection("references", v)}
      />
    </div>
  );
}
