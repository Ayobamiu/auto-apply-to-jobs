import { useState } from "react";
import { EditableText } from "./EditableText";
import { setResumePath, getProposedValueForPath, isPathUnderPatch, getAddPatchesForArray, type ProposedPatch } from "./utils";
import { Sparkles } from "lucide-react";
import { DiffView } from "../components/DiffView";

function getStr(obj: unknown, key: string): string {
  if (obj == null || typeof obj !== "object") return "";
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function getArr<T = unknown>(obj: unknown, key: string): T[] {
  if (obj == null || typeof obj !== "object") return [];
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function getObj(obj: unknown, key: string): Record<string, unknown> | null {
  if (obj == null || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function hasAnyOptionalBasicsContent(
  basics: Record<string, unknown>,
  location: Record<string, unknown>,
  profiles: Record<string, unknown>[],
): boolean {
  if (
    getStr(basics, "label") ||
    getStr(basics, "image") ||
    getStr(basics, "url")
  )
    return true;
  if (
    getStr(location, "city") ||
    getStr(location, "region") ||
    getStr(location, "countryCode") ||
    getStr(location, "address") ||
    getStr(location, "postalCode")
  )
    return true;
  return profiles.length > 0;
}

function hasAnyOptionalWorkContent(entry: Record<string, unknown>): boolean {
  return !!(
    getStr(entry, "location") ||
    getStr(entry, "url") ||
    getStr(entry, "description") ||
    getStr(entry, "summary")
  );
}

function hasAnyOptionalEducationContent(
  entry: Record<string, unknown>,
): boolean {
  return !!(
    getStr(entry, "url") ||
    getStr(entry, "studyType") ||
    getStr(entry, "score") ||
    getArr<string>(entry, "courses").length > 0
  );
}

function hasAnyOptionalProjectContent(entry: Record<string, unknown>): boolean {
  return !!(
    getStr(entry, "description") ||
    getStr(entry, "startDate") ||
    getStr(entry, "endDate") ||
    getStr(entry, "url") ||
    getStr(entry, "entity") ||
    getStr(entry, "type") ||
    getArr<string>(entry, "keywords").length > 0 ||
    getArr<string>(entry, "roles").length > 0
  );
}

/** Renders value as plain text when present; nothing when empty. Used in Preview mode. */
function DisplayText({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  if (value === "") return null;
  return <span className={className}>{value}</span>;
}

export interface ResumeDocumentProps {
  resume: Record<string, unknown>;
  onChange: (resume: Record<string, unknown>) => void;
  compact?: boolean;
  readOnly?: boolean;
  /** When true, disables click-to-select blocks/highlights (used post-submission). */
  disableSelection?: boolean;
  selectedNode?:
    | {
        path: string;
        label: string;
        data: string;
        type: "block" | "highlight";
      }
    | null
    | undefined;
  setSelectedNode?: (
    node:
      | {
          path: string;
          label: string;
          data: string;
          type: "block" | "highlight";
        }
      | null
      | undefined,
  ) => void;
  proposedPatches?: ProposedPatch[];
}

export function ResumeDocument({
  resume,
  onChange,
  compact = false,
  readOnly = false,
  disableSelection = false,
  selectedNode,
  setSelectedNode,
  proposedPatches = [], // From useAiEditor hook
}: ResumeDocumentProps) {
  const onCommit = (path: string, value: string) => {
    onChange(setResumePath(resume, path, value));
  };

  const basics = (resume.basics as Record<string, unknown>) ?? {};
  const location = getObj(basics, "location") ?? {};
  const profiles = getArr<Record<string, unknown>>(basics, "profiles");
  const work = getArr<Record<string, unknown>>(resume, "work");
  const volunteer = getArr<Record<string, unknown>>(resume, "volunteer");
  const education = getArr<Record<string, unknown>>(resume, "education");
  const skills = getArr<Record<string, unknown>>(resume, "skills");
  const projects = getArr<Record<string, unknown>>(resume, "projects");
  const languages = getArr<Record<string, unknown>>(resume, "languages");
  const certificates = getArr<Record<string, unknown>>(resume, "certificates");
  const awards = getArr<Record<string, unknown>>(resume, "awards");
  const publications = getArr<Record<string, unknown>>(resume, "publications");
  const interests = getArr<Record<string, unknown>>(resume, "interests");
  const references = getArr<Record<string, unknown>>(resume, "references");

  const [basicsOptionalExpanded, setBasicsOptionalExpanded] = useState(false);
  const [basicsExtraRevealed, setBasicsExtraRevealed] = useState<Set<string>>(
    new Set(),
  );
  const [contactLocationRevealed, setContactLocationRevealed] = useState(false);
  const [workOptionalExpanded, setWorkOptionalExpanded] = useState<Set<number>>(
    new Set(),
  );
  const [educationOptionalExpanded, setEducationOptionalExpanded] = useState<
    Set<number>
  >(new Set());
  const [projectsOptionalExpanded, setProjectsOptionalExpanded] = useState<
    Set<number>
  >(new Set());
  const [skillLevelExpanded, setSkillLevelExpanded] = useState<Set<number>>(
    new Set(),
  );

  const SectionWrapper = ({
    path,
    label,
    data,
    children,
    type = "block",
  }: {
    path: string;
    label: string;
    data: string;
    children: React.ReactNode;
    type?: "block" | "highlight";
  }) => {
    const isSelected = selectedNode?.path === path;
    const isBlockLevelProposed = isPathUnderPatch(path, proposedPatches);

    const handleSelect = (e: React.MouseEvent<HTMLDivElement>) => {
      // Prevent a highlight click from triggering a parent experience block click
      e.stopPropagation();

      if (disableSelection) return;
      if (isSelected) {
        // Toggle off: if clicked again, reset focus to null or a general state
        setSelectedNode?.(null);
      } else {
        setSelectedNode?.({ path, label, data, type });
      }
    };

    return (
      <div
        onClick={handleSelect}
        className={`relative transition-all duration-300 ${disableSelection ? "" : "cursor-pointer"} ${type === "highlight" ? "rounded-lg" : "rounded-xl"}
          ${type === "block" ? "p-0 border-2" : "p-0 border"}
          ${
            isSelected
              ? "border-slate-900 bg-slate-50/80 shadow-sm ring-1 ring-slate-900/10"
              : "border-transparent hover:border-slate-200"
          }
          ${isBlockLevelProposed ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]" : ""}
        `}
      >
        {/* Label Badge: Only show for larger blocks, not individual highlights */}
        {isSelected && type === "block" && (
          <span className="absolute -top-3 left-4 z-20 bg-slate-900 text-white text-[10px]  py-0.5 rounded-full uppercase tracking-widest font-bold animate-in fade-in zoom-in duration-200">
            AI FOCUS: {label}
          </span>
        )}

        {/* Indicator for individual highlight selection */}
        {isSelected && type === "highlight" && (
          <div className="absolute -left-6 top-1/2 -translate-y-1/2 z-30">
            <div className="flex items-center justify-center w-5 h-5 bg-slate-600 text-amber-300 rounded-full shadow-lg animate-in zoom-in spin-in-90 duration-300">
              <Sparkles size={12} fill="currentColor" />
            </div>
            {/* Connecting line to the text */}
            <div className="absolute left-5 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-slate-900/20" />
          </div>
        )}

        {children}
      </div>
    );
  };

  /** Renders a field with optional diff when this path (or a parent) has a proposed change. Supports recursive drill: if proposedChange is at work[1], work[1].position gets proposed from proposedChange.proposed.position. */
  const renderField = (path: string, defaultValue: string) => {
    const match = getProposedValueForPath(path, proposedPatches);
    // If no AI change applies to this field, render normal text
    if (!match) return <span>{defaultValue}</span>;

    const { proposed, isExact } = match;

    // If the AI is proposing an object (block update), the section component
    // handles the background aura; we just show the original text here
    // unless we want to drill down.
    if (typeof proposed !== "string") return <span>{defaultValue}</span>;

    // The 'Emerald Aura' highlights the specific text being changed
    return (
      <span className="relative inline">
        {isExact && (
          <span
            className="absolute -inset-1 bg-emerald-50/60 border border-emerald-200 border-dashed rounded -z-10 animate-pulse"
            aria-hidden
          />
        )}
        <DiffView original={defaultValue} proposed={proposed} />
      </span>
    );
  };
  const showBasicsOptional =
    basicsOptionalExpanded ||
    hasAnyOptionalBasicsContent(basics, location, profiles);
  const showRegion =
    getStr(location, "region") !== "" || basicsExtraRevealed.has("region");
  const showAddress =
    getStr(location, "address") !== "" || basicsExtraRevealed.has("address");
  const showImage =
    getStr(basics, "image") !== "" || basicsExtraRevealed.has("image");

  const addProfile = () => {
    onChange({
      ...resume,
      basics: {
        ...basics,
        profiles: [...profiles, { network: "", username: "", url: "" }],
      },
    });
  };

  const removeProfile = (index: number) => {
    onChange({
      ...resume,
      basics: { ...basics, profiles: profiles.filter((_, i) => i !== index) },
    });
  };

  const addWork = () => {
    onChange({
      ...resume,
      work: [
        ...work,
        {
          name: "",
          location: "",
          description: "",
          position: "",
          url: "",
          startDate: "",
          endDate: "",
          summary: "",
          highlights: [],
        },
      ],
    });
  };

  const removeWork = (index: number) => {
    onChange({
      ...resume,
      work: work.filter((_, i) => i !== index),
    });
  };

  const addVolunteer = () => {
    onChange({
      ...resume,
      volunteer: [
        ...volunteer,
        {
          organization: "",
          position: "",
          url: "",
          startDate: "",
          endDate: "",
          summary: "",
          highlights: [],
        },
      ],
    });
  };

  const removeVolunteer = (index: number) => {
    onChange({
      ...resume,
      volunteer: volunteer.filter((_, i) => i !== index),
    });
  };

  const addEducation = () => {
    onChange({
      ...resume,
      education: [
        ...education,
        {
          institution: "",
          url: "",
          area: "",
          studyType: "",
          startDate: "",
          endDate: "",
          score: "",
          courses: [],
        },
      ],
    });
  };

  const removeEducation = (index: number) => {
    onChange({
      ...resume,
      education: education.filter((_, i) => i !== index),
    });
  };

  const addSkillCategory = () => {
    onChange({
      ...resume,
      skills: [...skills, { name: "", level: "", keywords: [] }],
    });
  };

  const removeSkillCategory = (index: number) => {
    onChange({
      ...resume,
      skills: skills.filter((_, i) => i !== index),
    });
  };

  const addProject = () => {
    onChange({
      ...resume,
      projects: [
        ...projects,
        {
          name: "",
          description: "",
          highlights: [],
          keywords: [],
          startDate: "",
          endDate: "",
          url: "",
          roles: [],
          entity: "",
          type: "",
        },
      ],
    });
  };

  const removeProject = (index: number) => {
    onChange({
      ...resume,
      projects: projects.filter((_, i) => i !== index),
    });
  };

  const addLanguage = () =>
    onChange({
      ...resume,
      languages: [...languages, { language: "", fluency: "" }],
    });
  const removeLanguage = (index: number) =>
    onChange({ ...resume, languages: languages.filter((_, i) => i !== index) });

  const addCertificate = () =>
    onChange({
      ...resume,
      certificates: [
        ...certificates,
        { name: "", date: "", url: "", issuer: "" },
      ],
    });
  const removeCertificate = (index: number) =>
    onChange({
      ...resume,
      certificates: certificates.filter((_, i) => i !== index),
    });

  const addAward = () =>
    onChange({
      ...resume,
      awards: [...awards, { title: "", date: "", awarder: "", summary: "" }],
    });
  const removeAward = (index: number) =>
    onChange({ ...resume, awards: awards.filter((_, i) => i !== index) });

  const addPublication = () =>
    onChange({
      ...resume,
      publications: [
        ...publications,
        { name: "", publisher: "", releaseDate: "", url: "", summary: "" },
      ],
    });
  const removePublication = (index: number) =>
    onChange({
      ...resume,
      publications: publications.filter((_, i) => i !== index),
    });

  const addInterest = () =>
    onChange({
      ...resume,
      interests: [...interests, { name: "", keywords: [] }],
    });
  const removeInterest = (index: number) =>
    onChange({ ...resume, interests: interests.filter((_, i) => i !== index) });

  const addReference = () =>
    onChange({
      ...resume,
      references: [...references, { name: "", reference: "" }],
    });
  const removeReference = (index: number) =>
    onChange({
      ...resume,
      references: references.filter((_, i) => i !== index),
    });

  const addHighlight = (pathPrefix: string, current: string[]) => {
    onChange(setResumePath(resume, pathPrefix, [...current, ""]));
  };

  const removeHighlight = (
    pathPrefix: string,
    current: string[],
    index: number,
  ) => {
    onChange(
      setResumePath(
        resume,
        pathPrefix,
        current.filter((_, i) => i !== index),
      ),
    );
  };

  const sectionHeading =
    "text-xs font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1.5";
  const removeBtn =
    "text-red-600 hover:text-red-700 text-sm min-h-[44px] inline-flex items-center px-2 touch-manipulation";
  const addBtn =
    "mt-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium min-h-[44px] inline-flex items-center px-0 touch-manipulation";

  const sep = () => (
    <span className="text-gray-400 select-none mx-0.5" aria-hidden>
      |
    </span>
  );

  if (readOnly) {
    const sepP = () => (
      <span className="text-gray-400 select-none mx-0.5" aria-hidden>
        |
      </span>
    );
    const city = getStr(location, "city");
    const region = getStr(location, "region");
    const phone = getStr(basics, "phone");
    const email = getStr(basics, "email");
    const contactSegments: JSX.Element[] = [];
    if (city || region) {
      contactSegments.push(
        <span key="city-region">
          {renderField("basics.location.city", city)}
          {city && region ? ", " : ""}
          {renderField("basics.location.region", region)}
        </span>,
      );
    }
    if (phone) {
      contactSegments.push(
        <span key="phone">
          {renderField("basics.phone", phone)}
        </span>,
      );
    }
    if (email) {
      contactSegments.push(
        <span key="email">
          {renderField("basics.email", email)}
        </span>,
      );
    }
    if (profiles.length > 0) {
      profiles.forEach((pro, index) => {
        const profileUrl = getStr(pro, "url");
        if (profileUrl)
          contactSegments.push(
            <a
              key={`profile-${index}`}
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {renderField(`basics.profiles[${index}].url`, profileUrl)}
            </a>,
          );
      });
    } else {
      const url = getStr(basics, "url");
      if (url) {
        contactSegments.push(
          <span key="url">
            {renderField("basics.url", url)}
          </span>,
        );
      }
    }
    const contactLine =
      contactSegments.length > 0
        ? contactSegments.reduce<(JSX.Element | string)[]>(
            (acc, seg, i) => (i === 0 ? [seg] : [...acc, sepP(), seg]),
            [],
          )
        : null;
    const summary = getStr(getObj(resume, "basics"), "summary");
    return (
      <div className="flex justify-center">
        <div className="resume-page ">
          <div
            className={`flex flex-col text-gray-900 ${compact ? "gap-2" : "gap-3"}`}
          >
            <header className="text-center">
              <SectionWrapper
                path="basics.name"
                label="Name"
                data={getStr(basics, "name")}
              >
                <h1 className="text-lg md:text-xl font-semibold text-gray-900">
                  {getStr(basics, "name") || "\u00A0"}
                </h1>
              </SectionWrapper>

              <SectionWrapper
                path="basics.contact"
                label="Contact and Social Links"
                data={[
                  city,
                  region,
                  phone,
                  email,
                  ...profiles.map((p) => getStr(p, "url")),
                  getStr(basics, "url"),
                ]
                  .filter(Boolean)
                  .join(" | ")}
              >
                {contactLine && (
                  <div className="flex flex-wrap justify-center items-baseline gap-x-0 mt-0.5 text-sm text-gray-600">
                    {contactLine}
                  </div>
                )}
              </SectionWrapper>
              <div className="mt-1.5 text-left">
                <SectionWrapper
                  path="basics.label"
                  label="Title / Label"
                  data={getStr(basics, "label")}
                >
                  {getStr(basics, "label") ? (
                    <p className="text-sm font-semibold text-gray-900">
                      {getStr(basics, "label")}
                    </p>
                  ) : null}
                </SectionWrapper>
                <SectionWrapper
                  path="basics.summary"
                  label="Professional Summary"
                  data={getStr(basics, "summary")}
                >
                  {renderField("basics.summary", summary) ? (
                    <div className="mt-0.5 text-sm">
                      {renderField("basics.summary", summary)}
                    </div>
                  ) : null}
                </SectionWrapper>
              </div>
            </header>
            {(work.length > 0 || getAddPatchesForArray("work", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Experience</h2>
                {work.map((entry, i) => {
                  const loc = getStr(entry, "location");
                  const start = getStr(entry, "startDate");
                  const end = getStr(entry, "endDate");
                  const highlights = getArr<string>(entry, "highlights").filter(
                    Boolean,
                  );
                  const hasMeta = loc || start || end;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`work[${i}]`}
                      label={`Experience: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={compact ? "mb-2" : "mb-3"}>
                        <p className="text-sm">
                          <span className="text-gray-700">
                            {renderField(
                              `work[${i}].position`,
                              getStr(entry, "position"),
                            )}
                          </span>
                          {getStr(entry, "position") && getStr(entry, "name")
                            ? sepP()
                            : null}
                          <span className="font-semibold">
                            {renderField(
                              `work[${i}].name`,
                              getStr(entry, "name"),
                            )}
                          </span>
                          {hasMeta ? sepP() : null}
                          <span className="text-gray-500">
                            {renderField(`work[${i}].location`, loc)}
                          </span>
                          {loc && (start || end) ? sepP() : null}
                          <span className="text-gray-500">
                            {renderField(`work[${i}].startDate`, start)}
                            {start && end ? " – " : ""}
                            {renderField(`work[${i}].endDate`, end)}
                          </span>
                        </p>
                        {(() => {
                          const blockMatch = getProposedValueForPath(
                            `work[${i}]`,
                            proposedPatches,
                          );
                          const proposedHighlights =
                            blockMatch &&
                            typeof blockMatch.proposed === "object" &&
                            blockMatch.proposed != null &&
                            "highlights" in blockMatch.proposed
                              ? ((
                                  blockMatch.proposed as {
                                    highlights?: string[];
                                  }
                                ).highlights ?? [])
                              : [];
                          const hasHighlights =
                            highlights.length > 0 ||
                            proposedHighlights.length > 0;
                          if (!hasHighlights) return null;
                          const extraProposed = proposedHighlights
                            .slice(highlights.length)
                            .filter(Boolean);
                          return (
                            <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2 space-y-0.5">
                              {highlights.map((h, j) => {
                                const currentPath = `work[${i}].highlights[${j}]`;
                                const match = getProposedValueForPath(
                                  currentPath,
                                  proposedPatches,
                                );
                                const proposedStr =
                                  match && typeof match.proposed === "string"
                                    ? match.proposed
                                    : null;
                                return (
                                  <SectionWrapper
                                    key={j}
                                    path={`work[${i}].highlights[${j}]`}
                                    label="Specific Achievement"
                                    data={h}
                                    type="highlight"
                                  >
                                    {proposedStr != null ? (
                                      <li>
                                        <DiffView
                                          original={h}
                                          proposed={proposedStr}
                                        />
                                      </li>
                                    ) : (
                                      <li>{h}</li>
                                    )}
                                  </SectionWrapper>
                                );
                              })}
                              {extraProposed.map((text, k) => (
                                <li
                                  key={`add-${k}`}
                                  className="bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-300 pl-1 -ml-0.5 rounded"
                                >
                                  {text}
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </div>
                    </SectionWrapper>
                  );
                })}
                {getAddPatchesForArray("work", proposedPatches).map((patch, k) => {
                  const v = patch.value as Record<string, unknown>;
                  const hl = Array.isArray(v?.highlights) ? (v.highlights as string[]) : [];
                  return (
                    <div key={`add-work-${k}`} className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2">
                      <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>
                      <p className="text-sm mt-1">
                        <span className="text-gray-700">{(v?.position as string) ?? ""}</span>
                        {v?.position && v?.name ? <span className="text-gray-400 mx-1">|</span> : null}
                        <span className="font-semibold">{(v?.name as string) ?? ""}</span>
                        {v?.startDate ? <span className="text-gray-400 mx-1">|</span> : null}
                        <span className="text-gray-500">{(v?.startDate as string) ?? ""}{v?.startDate && v?.endDate ? " – " : ""}{(v?.endDate as string) ?? ""}</span>
                      </p>
                      {hl.length > 0 && (
                        <ul className="list-disc list-inside text-sm text-emerald-900 mt-0.5 ml-2 space-y-0.5">
                          {hl.map((h, j) => <li key={j}>{h}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
            {(volunteer.length > 0 || getAddPatchesForArray("volunteer", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Volunteer</h2>
                {volunteer.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`volunteer[${i}]`}
                    label={`Volunteer: ${getStr(entry, "organization").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={compact ? "mb-2" : "mb-3"}>
                      <p className="text-sm">
                        <DisplayText
                          value={getStr(entry, "position")}
                          className="text-gray-700"
                        />
                        {getStr(entry, "position") &&
                        getStr(entry, "organization")
                          ? sepP()
                          : null}
                        <DisplayText
                          value={getStr(entry, "organization")}
                          className="font-semibold"
                        />
                      </p>
                      <p className="text-gray-500 text-sm mt-0.5">
                        {getStr(entry, "startDate")}
                        {getStr(entry, "startDate") && getStr(entry, "endDate")
                          ? " – "
                          : ""}
                        {getStr(entry, "endDate")}
                      </p>
                      {getArr<string>(entry, "highlights").filter(Boolean)
                        .length > 0 && (
                        <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2">
                          {getArr<string>(entry, "highlights")
                            .filter(Boolean)
                            .map((h, j) => (
                              <SectionWrapper
                                key={j}
                                path={`volunteer[${i}].highlights[${j}]`}
                                label="Volunteer Highlight"
                                data={h}
                                type="highlight"
                              >
                                <li key={j}>{h}</li>
                              </SectionWrapper>
                            ))}
                        </ul>
                      )}
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
            {(education.length > 0 || getAddPatchesForArray("education", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Education</h2>
                {education.map((entry, i) => (
                  <SectionWrapper
                    path={`education[${i}]`}
                    label={`Education: ${getStr(entry, "institution").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div key={i} className={compact ? "mb-2" : "mb-3"}>
                      <p className="font-semibold text-sm">
                        <DisplayText value={getStr(entry, "institution")} />
                      </p>
                      <p className="text-gray-600 text-sm mt-0.5">
                        <DisplayText value={getStr(entry, "studyType")} />
                        {getStr(entry, "studyType") && getStr(entry, "area")
                          ? ", "
                          : null}
                        <DisplayText value={getStr(entry, "area")} />
                        {getStr(entry, "area") &&
                        (getStr(entry, "startDate") || getStr(entry, "endDate"))
                          ? " · "
                          : null}
                        {getStr(entry, "startDate")}
                        {getStr(entry, "startDate") && getStr(entry, "endDate")
                          ? " – "
                          : ""}
                        {getStr(entry, "endDate")}
                      </p>
                    </div>
                  </SectionWrapper>
                ))}
                {getAddPatchesForArray("education", proposedPatches).map((patch, k) => {
                  const v = patch.value as Record<string, unknown>;
                  return (
                    <div key={`add-edu-${k}`} className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2">
                      <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>
                      <p className="font-semibold text-sm mt-1"><DisplayText value={(v?.institution as string) ?? ""} /></p>
                      <p className="text-gray-600 text-sm">{(v?.studyType as string) ?? ""}{v?.studyType && v?.area ? ", " : ""}{(v?.area as string) ?? ""}</p>
                    </div>
                  );
                })}
              </section>
            )}
            {(projects.length > 0 || getAddPatchesForArray("projects", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Projects</h2>
                {projects.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`projects[${i}]`}
                    label={`Project: ${getStr(entry, "name").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div key={i} className={compact ? "mb-2" : "mb-3"}>
                      <p className="font-semibold text-sm">
                        <DisplayText value={getStr(entry, "name")} />
                      </p>
                      {getArr<string>(entry, "highlights").filter(Boolean)
                        .length > 0 && (
                        <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2">
                          {getArr<string>(entry, "highlights")
                            .filter(Boolean)
                            .map((h, j) => (
                              <SectionWrapper
                                key={j}
                                path={`projects[${i}].highlights[${j}]`}
                                label="Project Highlight"
                                data={h}
                                type="highlight"
                              >
                                <li>{h}</li>
                              </SectionWrapper>
                            ))}
                        </ul>
                      )}
                    </div>
                  </SectionWrapper>
                ))}
                {getAddPatchesForArray("projects", proposedPatches).map((patch, k) => {
                  const v = patch.value as Record<string, unknown>;
                  const hl = Array.isArray(v?.highlights) ? (v.highlights as string[]) : [];
                  return (
                    <div key={`add-proj-${k}`} className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2">
                      <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>
                      <p className="font-semibold text-sm mt-1"><DisplayText value={(v?.name as string) ?? ""} /></p>
                      {hl.length > 0 && <ul className="list-disc list-inside text-sm text-emerald-900 mt-0.5 ml-2">{hl.map((h, j) => <li key={j}>{h}</li>)}</ul>}
                    </div>
                  );
                })}
              </section>
            )}
            {(skills.length > 0 || getAddPatchesForArray("skills", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Skills</h2>
                {skills.map((entry, i) => {
                  const kws = getArr<string>(entry, "keywords").filter(Boolean);
                  const kwStr = kws.join(", ");
                  const currentPath = `skills[${i}].keywords`;
                  const match = getProposedValueForPath(
                    currentPath,
                    proposedPatches,
                  );
                  const proposedKeywords =
                    match && Array.isArray(match.proposed)
                      ? (match.proposed as string[]).join(", ")
                      : null;

                  if (compact) {
                    return (
                      <SectionWrapper
                        key={i}
                        path={`skills[${i}]`}
                        label={`Skill: ${getStr(entry, "name").slice(0, 10)}...`}
                        data={JSON.stringify(entry)}
                      >
                        <div className="mb-1.5 text-sm">
                          <DisplayText
                            value={getStr(entry, "name")}
                            className="font-semibold"
                          />
                          {/* {getStr(entry, "name") && kwStr ? ": " : null} */}
                          {proposedKeywords != null ? (
                            <DiffView
                              original={kwStr}
                              proposed={proposedKeywords}
                            />
                          ) : (
                            kwStr || null
                          )}
                        </div>
                      </SectionWrapper>
                    );
                  }
                  return (
                    <SectionWrapper
                      key={i}
                      path={`skills[${i}]`}
                      label={`Skill: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className="mb-3">
                        <p className="font-semibold text-sm">
                          <DisplayText value={getStr(entry, "name")} />
                        </p>
                        <p className="text-gray-700 text-sm mt-0.5">
                          {kwStr || "\u00A0"}
                        </p>
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}
            {languages.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Languages</h2>
                {languages.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`languages[${i}]`}
                    label={`Language: ${getStr(entry, "language").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={`${compact ? "mb-1.5" : "mb-3"} text-sm`}>
                      <DisplayText value={getStr(entry, "language")} /> —{" "}
                      <DisplayText value={getStr(entry, "fluency")} />
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
            {certificates.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Certificates</h2>
                {certificates.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`certificates[${i}]`}
                    label={`Certificate: ${getStr(entry, "name").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                      <DisplayText
                        value={getStr(entry, "name")}
                        className="font-semibold"
                      />
                      {getStr(entry, "name") && getStr(entry, "issuer")
                        ? " – "
                        : null}
                      <DisplayText value={getStr(entry, "issuer")} />
                      {getStr(entry, "issuer") && getStr(entry, "date")
                        ? ", "
                        : null}
                      <DisplayText value={getStr(entry, "date")} />
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
            {awards.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Awards</h2>
                {awards.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`awards[${i}]`}
                    label={`Award: ${getStr(entry, "title").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                      <DisplayText
                        value={getStr(entry, "title")}
                        className="font-semibold"
                      />
                      {getStr(entry, "title") && getStr(entry, "awarder")
                        ? " – "
                        : null}
                      <DisplayText value={getStr(entry, "awarder")} />
                      {getStr(entry, "awarder") && getStr(entry, "date")
                        ? ", "
                        : null}
                      <DisplayText value={getStr(entry, "date")} />
                      {getStr(entry, "summary") ? (
                        <p className="text-gray-700 mt-0.5">
                          {getStr(entry, "summary")}
                        </p>
                      ) : null}
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
            {publications.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Publications</h2>
                {publications.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`publications[${i}]`}
                    label={`Publication: ${getStr(entry, "name").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                      <DisplayText
                        value={getStr(entry, "name")}
                        className="font-semibold"
                      />
                      {getStr(entry, "name") && getStr(entry, "publisher")
                        ? " – "
                        : null}
                      <DisplayText value={getStr(entry, "publisher")} />
                      {getStr(entry, "publisher") &&
                      getStr(entry, "releaseDate")
                        ? ", "
                        : null}
                      <DisplayText value={getStr(entry, "releaseDate")} />
                      {getStr(entry, "summary") ? (
                        <p className="text-gray-700 mt-0.5">
                          {getStr(entry, "summary")}
                        </p>
                      ) : null}
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
            {interests.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Interests</h2>
                {interests.map((entry, i) => {
                  const kw = getArr<string>(entry, "keywords")
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <SectionWrapper
                      key={i}
                      path={`interests[${i}]`}
                      label={`Interest: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                        <DisplayText
                          value={getStr(entry, "name")}
                          className="font-semibold"
                        />
                        {getStr(entry, "name") && kw ? ": " : null}
                        {kw || null}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}
            {references.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>References</h2>
                {references.map((entry, i) => (
                  <SectionWrapper
                    key={i}
                    path={`references[${i}]`}
                    label={`Reference: ${getStr(entry, "name").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={compact ? "mb-1.5" : "mb-3"}>
                      <p className="font-semibold text-sm">
                        <DisplayText value={getStr(entry, "name")} />
                      </p>
                      {getStr(entry, "reference") ? (
                        <p className="text-sm text-gray-700 mt-0.5">
                          {getStr(entry, "reference")}
                        </p>
                      ) : null}
                    </div>
                  </SectionWrapper>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div className="resume-page ">
        <div
          className={`flex flex-col text-gray-900 ${compact ? "gap-2" : "gap-3"}`}
        >
          {/* Basics — centered, two lines, single contact line */}
          <header className="text-center">
            <h1 className="text-lg md:text-xl font-semibold text-gray-900">
              <EditableText
                value={getStr(basics, "name")}
                path="basics.name"
                onCommit={onCommit}
                className="font-semibold"
              />
            </h1>
            <div className="flex flex-wrap justify-center items-baseline gap-x-0 mt-0.5 text-sm text-gray-600">
              {getStr(location, "city") !== "" ||
              getStr(location, "region") !== "" ||
              contactLocationRevealed ? (
                <>
                  <EditableText
                    value={getStr(location, "city")}
                    path="basics.location.city"
                    onCommit={onCommit}
                    placeholder="City"
                  />
                  {getStr(location, "city") && getStr(location, "region") ? (
                    <span className="text-gray-400">, </span>
                  ) : null}
                  <EditableText
                    value={getStr(location, "region")}
                    path="basics.location.region"
                    onCommit={onCommit}
                    placeholder="Region"
                  />
                  {sep()}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={addBtn}
                    onClick={() => setContactLocationRevealed(true)}
                  >
                    + Add location
                  </button>
                  {sep()}
                </>
              )}
              <EditableText
                value={getStr(basics, "phone")}
                path="basics.phone"
                onCommit={onCommit}
                placeholder="Phone"
              />
              {sep()}
              <EditableText
                value={getStr(basics, "email")}
                path="basics.email"
                onCommit={onCommit}
                placeholder="Email"
              />
              {profiles.length > 0
                ? profiles.map((pro, pi) => (
                    <span key={pi} className="contents">
                      {sep()}
                      <EditableText
                        value={getStr(pro, "url")}
                        path={`basics.profiles.${pi}.url`}
                        onCommit={onCommit}
                        placeholder="URL"
                      />
                    </span>
                  ))
                : [
                    sep(),
                    <EditableText
                      key="website"
                      value={getStr(basics, "url")}
                      path="basics.url"
                      onCommit={onCommit}
                      placeholder="Website"
                    />,
                  ]}
            </div>
            {!showBasicsOptional && (
              <div className="mt-1 flex justify-center">
                <button
                  type="button"
                  className={addBtn}
                  onClick={() => setBasicsOptionalExpanded(true)}
                >
                  + Add address, photo or social links
                </button>
              </div>
            )}
            {showBasicsOptional && (
              <>
                {/* City, region, website are only on the contact line above — no duplicate here */}
                {showAddress ? (
                  <div className="mt-0.5 text-sm text-gray-600">
                    <EditableText
                      value={getStr(location, "address")}
                      path="basics.location.address"
                      onCommit={onCommit}
                      placeholder="Address"
                      className="block"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={addBtn}
                    onClick={() =>
                      setBasicsExtraRevealed((s) => new Set(s).add("address"))
                    }
                  >
                    + Add address
                  </button>
                )}
                {/* {showImage ? (
              <p className="mt-0.5 text-sm text-gray-600">
                <EditableText
                  value={getStr(basics, "image")}
                  path="basics.image"
                  onCommit={onCommit}
                  placeholder="Image URL"
                />
              </p>
            ) : (
              <button
                type="button"
                className={addBtn}
                onClick={() =>
                  setBasicsExtraRevealed((s) => new Set(s).add("image"))
                }
              >
                + Add photo
              </button>
            )} */}
                <div className="mt-2">
                  {profiles.map((pro, pi) => (
                    <div
                      key={pi}
                      className="flex flex-wrap items-center gap-2 mb-1"
                    >
                      <EditableText
                        value={getStr(pro, "network")}
                        path={`basics.profiles.${pi}.network`}
                        onCommit={onCommit}
                        placeholder="Network"
                        className="text-sm"
                      />
                      <EditableText
                        value={getStr(pro, "username")}
                        path={`basics.profiles.${pi}.username`}
                        onCommit={onCommit}
                        placeholder="Username"
                        className="text-sm"
                      />
                      <EditableText
                        value={getStr(pro, "url")}
                        path={`basics.profiles.${pi}.url`}
                        onCommit={onCommit}
                        placeholder="URL"
                        className="text-sm"
                      />
                      <button
                        type="button"
                        className={removeBtn}
                        onClick={() => removeProfile(pi)}
                        aria-label="Remove profile"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className={addBtn} onClick={addProfile}>
                  + Add social media profile
                </button>
              </>
            )}
            {/* Label is the title of the summary section (e.g. "Software Engineer"); left-aligned */}
            <div className="mt-1.5 text-left">
              <p className="text-sm font-semibold text-gray-900">
                <EditableText
                  value={getStr(basics, "label")}
                  path="basics.label"
                  onCommit={onCommit}
                  placeholder="Label (e.g. Software Engineer)"
                  className="font-semibold"
                />
              </p>
              <div className="mt-0.5 text-sm">
                <EditableText
                  value={getStr(basics, "summary")}
                  path="basics.summary"
                  onCommit={onCommit}
                  multiline
                  placeholder="Summary"
                  className="block w-full"
                />
              </div>
            </div>
          </header>

          {/* Work — denser: Position | Company, then Location | Start – End */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Experience</h2>
            {work.map((entry, i) => {
              const showWorkOptional =
                workOptionalExpanded.has(i) || hasAnyOptionalWorkContent(entry);
              const workEntryClass = compact ? "mb-2" : "mb-3";
              return (
                <div key={i} className={workEntryClass}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                      <span className="text-gray-700">
                        <EditableText
                          value={getStr(entry, "position")}
                          path={`work.${i}.position`}
                          onCommit={onCommit}
                          placeholder="Position"
                        />
                      </span>
                      <span
                        className="text-gray-400 select-none mx-0.5"
                        aria-hidden
                      >
                        |
                      </span>
                      <span className="font-semibold">
                        <EditableText
                          value={getStr(entry, "name")}
                          path={`work.${i}.name`}
                          onCommit={onCommit}
                          placeholder="Company"
                        />
                      </span>
                      <span
                        className="text-gray-400 select-none mx-0.5"
                        aria-hidden
                      >
                        |
                      </span>
                      <span className="text-gray-500">
                        <EditableText
                          value={getStr(entry, "location")}
                          path={`work.${i}.location`}
                          onCommit={onCommit}
                          placeholder="Location"
                        />
                      </span>
                      <span
                        className="text-gray-400 select-none mx-0.5"
                        aria-hidden
                      >
                        |
                      </span>
                      <span className="text-gray-500">
                        <EditableText
                          value={getStr(entry, "startDate")}
                          path={`work.${i}.startDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                        {" – "}
                        <EditableText
                          value={getStr(entry, "endDate")}
                          path={`work.${i}.endDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                      </span>
                    </div>
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeWork(i)}
                      aria-label="Remove experience"
                    >
                      Remove
                    </button>
                  </div>
                  {!showWorkOptional && (
                    <button
                      type="button"
                      className={addBtn}
                      onClick={() =>
                        setWorkOptionalExpanded((s) => new Set(s).add(i))
                      }
                    >
                      + Add location, company link or summary
                    </button>
                  )}
                  {showWorkOptional && (
                    <>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-600">
                        <EditableText
                          value={getStr(entry, "location")}
                          path={`work.${i}.location`}
                          onCommit={onCommit}
                          placeholder="Location"
                        />
                        <EditableText
                          value={getStr(entry, "url")}
                          path={`work.${i}.url`}
                          onCommit={onCommit}
                          placeholder="Company URL"
                        />
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">
                        <EditableText
                          value={getStr(entry, "description")}
                          path={`work.${i}.description`}
                          onCommit={onCommit}
                          placeholder="Company description"
                        />
                      </p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        <EditableText
                          value={getStr(entry, "summary")}
                          path={`work.${i}.summary`}
                          onCommit={onCommit}
                          multiline
                          placeholder="Role summary"
                          className="block"
                        />
                      </p>
                    </>
                  )}
                  <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-sm text-gray-700 ml-2">
                    {getArr<string>(entry, "highlights").map((bullet, j) => (
                      <li key={j} className="flex items-start gap-1">
                        <EditableText
                          value={bullet}
                          path={`work.${i}.highlights.${j}`}
                          onCommit={onCommit}
                          className="flex-1"
                        />
                        <button
                          type="button"
                          className="shrink-0 text-red-600 hover:text-red-700 text-xs min-h-[44px] inline-flex items-center touch-manipulation"
                          onClick={() =>
                            removeHighlight(
                              `work.${i}.highlights`,
                              getArr<string>(entry, "highlights"),
                              j,
                            )
                          }
                          aria-label="Remove bullet"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    <li className="list-none">
                      <button
                        type="button"
                        className={addBtn}
                        onClick={() =>
                          addHighlight(
                            `work.${i}.highlights`,
                            getArr<string>(entry, "highlights"),
                          )
                        }
                      >
                        + Add bullet
                      </button>
                    </li>
                  </ul>
                </div>
              );
            })}
            <button type="button" className={addBtn} onClick={addWork}>
              + Add experience
            </button>
          </section>

          {/* Volunteer — same density as Work: Position at Organization, then Location | Start – End */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Volunteer</h2>
            {volunteer.map((entry, i) => (
              <div key={i} className={compact ? "mb-2" : "mb-3"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-sm text-gray-700">
                      <EditableText
                        value={getStr(entry, "position")}
                        path={`volunteer.${i}.position`}
                        onCommit={onCommit}
                        placeholder="Role"
                      />
                    </span>
                    <span
                      className="text-gray-400 select-none mx-0.5"
                      aria-hidden
                    >
                      |
                    </span>
                    <span className="font-semibold text-sm">
                      <EditableText
                        value={getStr(entry, "organization")}
                        path={`volunteer.${i}.organization`}
                        onCommit={onCommit}
                        placeholder="Organization"
                      />
                    </span>
                  </div>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removeVolunteer(i)}
                    aria-label="Remove volunteer"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-gray-500 text-sm mt-0.5">
                  <EditableText
                    value={getStr(entry, "startDate")}
                    path={`volunteer.${i}.startDate`}
                    onCommit={onCommit}
                    className="text-sm"
                  />
                  {" – "}
                  <EditableText
                    value={getStr(entry, "endDate")}
                    path={`volunteer.${i}.endDate`}
                    onCommit={onCommit}
                    className="text-sm"
                  />
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  <EditableText
                    value={getStr(entry, "url")}
                    path={`volunteer.${i}.url`}
                    onCommit={onCommit}
                    placeholder="URL"
                  />
                </p>
                <p className="text-sm text-gray-700 mt-0.5">
                  <EditableText
                    value={getStr(entry, "summary")}
                    path={`volunteer.${i}.summary`}
                    onCommit={onCommit}
                    multiline
                    placeholder="Summary"
                    className="block"
                  />
                </p>
                <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-sm text-gray-700 ml-2">
                  {getArr<string>(entry, "highlights").map((bullet, j) => (
                    <li key={j} className="flex items-start gap-1">
                      <EditableText
                        value={bullet}
                        path={`volunteer.${i}.highlights.${j}`}
                        onCommit={onCommit}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        className="shrink-0 text-red-600 hover:text-red-700 text-xs min-h-[44px] inline-flex items-center touch-manipulation"
                        onClick={() =>
                          removeHighlight(
                            `volunteer.${i}.highlights`,
                            getArr<string>(entry, "highlights"),
                            j,
                          )
                        }
                        aria-label="Remove bullet"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  <li className="list-none">
                    <button
                      type="button"
                      className={addBtn}
                      onClick={() =>
                        addHighlight(
                          `volunteer.${i}.highlights`,
                          getArr<string>(entry, "highlights"),
                        )
                      }
                    >
                      + Add bullet
                    </button>
                  </li>
                </ul>
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addVolunteer}>
              + Add volunteer experience
            </button>
          </section>

          {/* Education — denser: institution · area, then dates (or studyType, area · dates when expanded) */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Education</h2>
            {education.map((entry, i) => {
              const showEducationOptional =
                educationOptionalExpanded.has(i) ||
                hasAnyOptionalEducationContent(entry);
              const entryClass = compact ? "mb-2" : "mb-3";
              return (
                <div
                  key={i}
                  className={`${entryClass} flex flex-wrap items-start justify-between gap-2`}
                >
                  <div>
                    <span className="font-semibold text-sm">
                      <EditableText
                        value={getStr(entry, "institution")}
                        path={`education.${i}.institution`}
                        onCommit={onCommit}
                      />
                    </span>
                    {!showEducationOptional && (
                      <span className="text-gray-600 text-sm ml-1">
                        <EditableText
                          value={getStr(entry, "area")}
                          path={`education.${i}.area`}
                          onCommit={onCommit}
                          placeholder="Area"
                        />
                      </span>
                    )}
                    {showEducationOptional ? (
                      <span className="text-gray-600 text-sm ml-1">
                        <EditableText
                          value={getStr(entry, "studyType")}
                          path={`education.${i}.studyType`}
                          onCommit={onCommit}
                          placeholder="Study type"
                        />
                        {", "}
                        <EditableText
                          value={getStr(entry, "area")}
                          path={`education.${i}.area`}
                          onCommit={onCommit}
                          placeholder="Area"
                        />
                        {" · "}
                        <EditableText
                          value={getStr(entry, "startDate")}
                          path={`education.${i}.startDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                        {" – "}
                        <EditableText
                          value={getStr(entry, "endDate")}
                          path={`education.${i}.endDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                      </span>
                    ) : (
                      <span className="text-gray-500 text-sm block mt-0.5">
                        <EditableText
                          value={getStr(entry, "startDate")}
                          path={`education.${i}.startDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                        {" – "}
                        <EditableText
                          value={getStr(entry, "endDate")}
                          path={`education.${i}.endDate`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                      </span>
                    )}
                    {!showEducationOptional && (
                      <button
                        type="button"
                        className={addBtn}
                        onClick={() =>
                          setEducationOptionalExpanded((s) => new Set(s).add(i))
                        }
                      >
                        + Add URL, degree type, GPA or courses
                      </button>
                    )}
                    {showEducationOptional && (
                      <>
                        <p className="text-sm text-gray-500 mt-0.5">
                          <EditableText
                            value={getStr(entry, "score")}
                            path={`education.${i}.score`}
                            onCommit={onCommit}
                            placeholder="Score (e.g. GPA)"
                          />
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          <EditableText
                            value={getStr(entry, "url")}
                            path={`education.${i}.url`}
                            onCommit={onCommit}
                            placeholder="Institution URL"
                          />
                        </p>
                        <div className="text-sm text-gray-600 mt-0.5">
                          {getArr<string>(entry, "courses").map((c, ci) => (
                            <span
                              key={ci}
                              className="inline-flex items-center gap-1 mr-2"
                            >
                              <EditableText
                                value={c}
                                path={`education.${i}.courses.${ci}`}
                                onCommit={onCommit}
                                className="text-sm"
                              />
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-700 text-xs"
                                onClick={() =>
                                  onChange(
                                    setResumePath(
                                      resume,
                                      `education.${i}.courses`,
                                      getArr<string>(entry, "courses").filter(
                                        (_, idx) => idx !== ci,
                                      ),
                                    ),
                                  )
                                }
                                aria-label="Remove course"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <button
                            type="button"
                            className={addBtn}
                            onClick={() =>
                              addHighlight(
                                `education.${i}.courses`,
                                getArr<string>(entry, "courses"),
                              )
                            }
                          >
                            + Add course
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removeEducation(i)}
                    aria-label="Remove education"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <button type="button" className={addBtn} onClick={addEducation}>
              + Add education
            </button>
          </section>

          {/* Projects */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Projects</h2>
            {projects.map((entry, i) => {
              const showProjectsOptional =
                projectsOptionalExpanded.has(i) ||
                hasAnyOptionalProjectContent(entry);
              return (
                <div key={i} className="mb-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm">
                      <EditableText
                        value={getStr(entry, "name")}
                        path={`projects.${i}.name`}
                        onCommit={onCommit}
                      />
                    </span>
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeProject(i)}
                      aria-label="Remove project"
                    >
                      Remove
                    </button>
                  </div>
                  {!showProjectsOptional && (
                    <button
                      type="button"
                      className={addBtn}
                      onClick={() =>
                        setProjectsOptionalExpanded((s) => new Set(s).add(i))
                      }
                    >
                      + Add description, dates, link or roles
                    </button>
                  )}
                  {showProjectsOptional && (
                    <>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-600 mt-0.5">
                        <EditableText
                          value={getStr(entry, "startDate")}
                          path={`projects.${i}.startDate`}
                          onCommit={onCommit}
                          placeholder="Start"
                        />
                        <EditableText
                          value={getStr(entry, "endDate")}
                          path={`projects.${i}.endDate`}
                          onCommit={onCommit}
                          placeholder="End"
                        />
                        <EditableText
                          value={getStr(entry, "url")}
                          path={`projects.${i}.url`}
                          onCommit={onCommit}
                          placeholder="URL"
                        />
                        <EditableText
                          value={getStr(entry, "entity")}
                          path={`projects.${i}.entity`}
                          onCommit={onCommit}
                          placeholder="Entity"
                        />
                        <EditableText
                          value={getStr(entry, "type")}
                          path={`projects.${i}.type`}
                          onCommit={onCommit}
                          placeholder="Type"
                        />
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">
                        <EditableText
                          value={getStr(entry, "description")}
                          path={`projects.${i}.description`}
                          onCommit={onCommit}
                          placeholder="Description"
                        />
                      </p>
                      <div className="text-sm text-gray-600 mt-0.5 flex flex-wrap gap-1.5">
                        {getArr<string>(entry, "keywords").map((kw, ki) => (
                          <span
                            key={ki}
                            className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded"
                          >
                            <EditableText
                              value={kw}
                              path={`projects.${i}.keywords.${ki}`}
                              onCommit={onCommit}
                              className="text-sm"
                            />
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-700"
                              onClick={() =>
                                onChange(
                                  setResumePath(
                                    resume,
                                    `projects.${i}.keywords`,
                                    getArr<string>(entry, "keywords").filter(
                                      (_, idx) => idx !== ki,
                                    ),
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          className={addBtn}
                          onClick={() =>
                            addHighlight(
                              `projects.${i}.keywords`,
                              getArr<string>(entry, "keywords"),
                            )
                          }
                        >
                          + keyword
                        </button>
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5 flex flex-wrap gap-1.5">
                        {getArr<string>(entry, "roles").map((r, ri) => (
                          <span
                            key={ri}
                            className="inline-flex items-center gap-1"
                          >
                            <EditableText
                              value={r}
                              path={`projects.${i}.roles.${ri}`}
                              onCommit={onCommit}
                              className="text-sm"
                            />
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-700"
                              onClick={() =>
                                onChange(
                                  setResumePath(
                                    resume,
                                    `projects.${i}.roles`,
                                    getArr<string>(entry, "roles").filter(
                                      (_, idx) => idx !== ri,
                                    ),
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          className={addBtn}
                          onClick={() =>
                            addHighlight(
                              `projects.${i}.roles`,
                              getArr<string>(entry, "roles"),
                            )
                          }
                        >
                          + role
                        </button>
                      </div>
                    </>
                  )}
                  <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-sm text-gray-700 ml-2">
                    {getArr<string>(entry, "highlights").map((bullet, j) => (
                      <li key={j} className="flex items-start gap-1">
                        <EditableText
                          value={bullet}
                          path={`projects.${i}.highlights.${j}`}
                          onCommit={onCommit}
                          className="flex-1"
                        />
                        <button
                          type="button"
                          className="shrink-0 text-red-600 hover:text-red-700 text-xs min-h-[44px] inline-flex items-center touch-manipulation"
                          onClick={() =>
                            removeHighlight(
                              `projects.${i}.highlights`,
                              getArr<string>(entry, "highlights"),
                              j,
                            )
                          }
                          aria-label="Remove bullet"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    <li className="list-none">
                      <button
                        type="button"
                        className={addBtn}
                        onClick={() =>
                          addHighlight(
                            `projects.${i}.highlights`,
                            getArr<string>(entry, "highlights"),
                          )
                        }
                      >
                        + Add bullet
                      </button>
                    </li>
                  </ul>
                </div>
              );
            })}
            <button type="button" className={addBtn} onClick={addProject}>
              + Add project
            </button>
          </section>

          {/* Skills — tags (default) or inline one line per category when compact */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Skills</h2>
            {skills.map((entry, i) => {
              const keywords = getArr<string>(entry, "keywords");
              const showLevel =
                getStr(entry, "level") !== "" || skillLevelExpanded.has(i);
              const keywordsInline = keywords.join(", ");
              const onKeywordsCommit = (path: string, value: string) => {
                const next = value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                onChange(setResumePath(resume, `skills.${i}.keywords`, next));
              };
              if (compact) {
                return (
                  <div
                    key={i}
                    className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span className="text-sm">
                      <span className="font-semibold">
                        <EditableText
                          value={getStr(entry, "name")}
                          path={`skills.${i}.name`}
                          onCommit={onCommit}
                          placeholder="Category"
                        />
                      </span>
                      <span className="text-gray-500 mx-1">: </span>
                      <EditableText
                        value={keywordsInline}
                        path={`skills.${i}.keywords`}
                        onCommit={onKeywordsCommit}
                        placeholder="keyword1, keyword2"
                        className="text-gray-700"
                      />
                    </span>
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeSkillCategory(i)}
                      aria-label="Remove skill category"
                    >
                      Remove
                    </button>
                  </div>
                );
              }
              return (
                <div key={i} className="mb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-sm">
                      <EditableText
                        value={getStr(entry, "name")}
                        path={`skills.${i}.name`}
                        onCommit={onCommit}
                        placeholder="Category name"
                      />
                    </span>
                    {showLevel && (
                      <span className="text-gray-500 text-sm">
                        <EditableText
                          value={getStr(entry, "level")}
                          path={`skills.${i}.level`}
                          onCommit={onCommit}
                          placeholder="Level"
                        />
                      </span>
                    )}
                    {!showLevel && (
                      <button
                        type="button"
                        className={addBtn}
                        onClick={() =>
                          setSkillLevelExpanded((s) => new Set(s).add(i))
                        }
                      >
                        + Add level
                      </button>
                    )}
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeSkillCategory(i)}
                      aria-label="Remove skill category"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {keywords.map((kw, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-sm min-h-[44px]"
                      >
                        <EditableText
                          value={kw}
                          path={`skills.${i}.keywords.${j}`}
                          onCommit={onCommit}
                          className="text-sm py-1"
                        />
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-700 touch-manipulation"
                          onClick={() =>
                            removeHighlight(`skills.${i}.keywords`, keywords, j)
                          }
                          aria-label="Remove keyword"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className={addBtn}
                      onClick={() =>
                        addHighlight(`skills.${i}.keywords`, keywords)
                      }
                    >
                      + keyword
                    </button>
                  </div>
                </div>
              );
            })}
            <button type="button" className={addBtn} onClick={addSkillCategory}>
              + Add skill category
            </button>
          </section>

          {/* Languages — already one line; tighter when compact */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Languages</h2>
            {languages.map((entry, i) => (
              <div
                key={i}
                className={`${compact ? "mb-1.5" : "mb-3"} flex flex-wrap items-center justify-between gap-2`}
              >
                <span className="text-sm">
                  <EditableText
                    value={getStr(entry, "language")}
                    path={`languages.${i}.language`}
                    onCommit={onCommit}
                    placeholder="Language"
                  />
                  {" — "}
                  <EditableText
                    value={getStr(entry, "fluency")}
                    path={`languages.${i}.fluency`}
                    onCommit={onCommit}
                    placeholder="Fluency"
                  />
                </span>
                <button
                  type="button"
                  className={removeBtn}
                  onClick={() => removeLanguage(i)}
                  aria-label="Remove language"
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addLanguage}>
              + Add language
            </button>
          </section>

          {/* Certificates — one line when compact: Name – Issuer, Date */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Certificates</h2>
            {certificates.map((entry, i) => (
              <div key={i} className={compact ? "mb-1.5" : "mb-3"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-semibold">
                      <EditableText
                        value={getStr(entry, "name")}
                        path={`certificates.${i}.name`}
                        onCommit={onCommit}
                        placeholder="Certificate name"
                      />
                    </span>
                    {compact && (
                      <>
                        <span className="text-gray-500 mx-1">–</span>
                        <EditableText
                          value={getStr(entry, "issuer")}
                          path={`certificates.${i}.issuer`}
                          onCommit={onCommit}
                          placeholder="Issuer"
                          className="text-gray-600"
                        />
                        <span className="text-gray-500 mx-1">,</span>
                        <EditableText
                          value={getStr(entry, "date")}
                          path={`certificates.${i}.date`}
                          onCommit={onCommit}
                          placeholder="Date"
                          className="text-gray-600"
                        />
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removeCertificate(i)}
                    aria-label="Remove certificate"
                  >
                    Remove
                  </button>
                </div>
                {!compact && (
                  <p className="text-sm text-gray-600 mt-0.5">
                    <EditableText
                      value={getStr(entry, "issuer")}
                      path={`certificates.${i}.issuer`}
                      onCommit={onCommit}
                      placeholder="Issuer"
                    />
                    {" · "}
                    <EditableText
                      value={getStr(entry, "date")}
                      path={`certificates.${i}.date`}
                      onCommit={onCommit}
                      placeholder="Date"
                    />
                    {" · "}
                    <EditableText
                      value={getStr(entry, "url")}
                      path={`certificates.${i}.url`}
                      onCommit={onCommit}
                      placeholder="URL"
                    />
                  </p>
                )}
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addCertificate}>
              + Add certificate
            </button>
          </section>

          {/* Awards — one line when compact: Title – Awarder, Date */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Awards</h2>
            {awards.map((entry, i) => (
              <div key={i} className={compact ? "mb-1.5" : "mb-3"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-semibold">
                      <EditableText
                        value={getStr(entry, "title")}
                        path={`awards.${i}.title`}
                        onCommit={onCommit}
                        placeholder="Award title"
                      />
                    </span>
                    {compact ? (
                      <>
                        <span className="text-gray-500 mx-1">–</span>
                        <EditableText
                          value={getStr(entry, "awarder")}
                          path={`awards.${i}.awarder`}
                          onCommit={onCommit}
                          placeholder="Awarder"
                          className="text-gray-600"
                        />
                        <span className="text-gray-500 mx-1">,</span>
                        <EditableText
                          value={getStr(entry, "date")}
                          path={`awards.${i}.date`}
                          onCommit={onCommit}
                          placeholder="Date"
                          className="text-gray-600"
                        />
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removeAward(i)}
                    aria-label="Remove award"
                  >
                    Remove
                  </button>
                </div>
                {!compact && (
                  <>
                    <p className="text-sm text-gray-600 mt-0.5">
                      <EditableText
                        value={getStr(entry, "awarder")}
                        path={`awards.${i}.awarder`}
                        onCommit={onCommit}
                        placeholder="Awarder"
                      />
                      {" · "}
                      <EditableText
                        value={getStr(entry, "date")}
                        path={`awards.${i}.date`}
                        onCommit={onCommit}
                        placeholder="Date"
                      />
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      <EditableText
                        value={getStr(entry, "summary")}
                        path={`awards.${i}.summary`}
                        onCommit={onCommit}
                        multiline
                        placeholder="Summary"
                        className="block"
                      />
                    </p>
                  </>
                )}
                {compact && getStr(entry, "summary") && (
                  <p className="text-sm text-gray-700 mt-0.5">
                    <EditableText
                      value={getStr(entry, "summary")}
                      path={`awards.${i}.summary`}
                      onCommit={onCommit}
                      multiline
                      placeholder="Summary"
                      className="block"
                    />
                  </p>
                )}
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addAward}>
              + Add award
            </button>
          </section>

          {/* Publications — one line when compact: Name – Publisher, Date */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Publications</h2>
            {publications.map((entry, i) => (
              <div key={i} className={compact ? "mb-1.5" : "mb-3"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-semibold">
                      <EditableText
                        value={getStr(entry, "name")}
                        path={`publications.${i}.name`}
                        onCommit={onCommit}
                        placeholder="Publication name"
                      />
                    </span>
                    {compact ? (
                      <>
                        <span className="text-gray-500 mx-1">–</span>
                        <EditableText
                          value={getStr(entry, "publisher")}
                          path={`publications.${i}.publisher`}
                          onCommit={onCommit}
                          placeholder="Publisher"
                          className="text-gray-600"
                        />
                        <span className="text-gray-500 mx-1">,</span>
                        <EditableText
                          value={getStr(entry, "releaseDate")}
                          path={`publications.${i}.releaseDate`}
                          onCommit={onCommit}
                          placeholder="Date"
                          className="text-gray-600"
                        />
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removePublication(i)}
                    aria-label="Remove publication"
                  >
                    Remove
                  </button>
                </div>
                {!compact && (
                  <>
                    <p className="text-sm text-gray-600 mt-0.5">
                      <EditableText
                        value={getStr(entry, "publisher")}
                        path={`publications.${i}.publisher`}
                        onCommit={onCommit}
                        placeholder="Publisher"
                      />
                      {" · "}
                      <EditableText
                        value={getStr(entry, "releaseDate")}
                        path={`publications.${i}.releaseDate`}
                        onCommit={onCommit}
                        placeholder="Date"
                      />
                      {" · "}
                      <EditableText
                        value={getStr(entry, "url")}
                        path={`publications.${i}.url`}
                        onCommit={onCommit}
                        placeholder="URL"
                      />
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      <EditableText
                        value={getStr(entry, "summary")}
                        path={`publications.${i}.summary`}
                        onCommit={onCommit}
                        multiline
                        placeholder="Summary"
                        className="block"
                      />
                    </p>
                  </>
                )}
                {compact && getStr(entry, "summary") && (
                  <p className="text-sm text-gray-700 mt-0.5">
                    <EditableText
                      value={getStr(entry, "summary")}
                      path={`publications.${i}.summary`}
                      onCommit={onCommit}
                      multiline
                      placeholder="Summary"
                      className="block"
                    />
                  </p>
                )}
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addPublication}>
              + Add publication
            </button>
          </section>

          {/* Interests — one line when compact: Name: kw1, kw2 */}
          <section className="resume-section">
            <h2 className={sectionHeading}>Interests</h2>
            {interests.map((entry, i) => {
              const kw = getArr<string>(entry, "keywords");
              const keywordsInline = kw.join(", ");
              const onInterestKeywordsCommit = (
                path: string,
                value: string,
              ) => {
                const next = value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                onChange(
                  setResumePath(resume, `interests.${i}.keywords`, next),
                );
              };
              if (compact) {
                return (
                  <div
                    key={i}
                    className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span className="text-sm">
                      <span className="font-semibold">
                        <EditableText
                          value={getStr(entry, "name")}
                          path={`interests.${i}.name`}
                          onCommit={onCommit}
                          placeholder="Interest"
                        />
                      </span>
                      <span className="text-gray-500 mx-1">: </span>
                      <EditableText
                        value={keywordsInline}
                        path={`interests.${i}.keywords`}
                        onCommit={onInterestKeywordsCommit}
                        placeholder="keyword1, keyword2"
                        className="text-gray-700"
                      />
                    </span>
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeInterest(i)}
                      aria-label="Remove interest"
                    >
                      Remove
                    </button>
                  </div>
                );
              }
              return (
                <div key={i} className="mb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-sm">
                      <EditableText
                        value={getStr(entry, "name")}
                        path={`interests.${i}.name`}
                        onCommit={onCommit}
                        placeholder="Interest name"
                      />
                    </span>
                    <button
                      type="button"
                      className={removeBtn}
                      onClick={() => removeInterest(i)}
                      aria-label="Remove interest"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {kw.map((k, ki) => (
                      <span
                        key={ki}
                        className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-sm"
                      >
                        <EditableText
                          value={k}
                          path={`interests.${i}.keywords.${ki}`}
                          onCommit={onCommit}
                          className="text-sm"
                        />
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-700"
                          onClick={() =>
                            onChange(
                              setResumePath(
                                resume,
                                `interests.${i}.keywords`,
                                kw.filter((_, idx) => idx !== ki),
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className={addBtn}
                      onClick={() =>
                        addHighlight(`interests.${i}.keywords`, kw)
                      }
                    >
                      + keyword
                    </button>
                  </div>
                </div>
              );
            })}
            <button type="button" className={addBtn} onClick={addInterest}>
              + Add interest
            </button>
          </section>

          {/* References — tighter when compact */}
          <section className="resume-section">
            <h2 className={sectionHeading}>References</h2>
            {references.map((entry, i) => (
              <div key={i} className={compact ? "mb-1.5" : "mb-3"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm">
                    <EditableText
                      value={getStr(entry, "name")}
                      path={`references.${i}.name`}
                      onCommit={onCommit}
                      placeholder="Name"
                    />
                  </span>
                  <button
                    type="button"
                    className={removeBtn}
                    onClick={() => removeReference(i)}
                    aria-label="Remove reference"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">
                  <EditableText
                    value={getStr(entry, "reference")}
                    path={`references.${i}.reference`}
                    onCommit={onCommit}
                    multiline
                    placeholder="Reference"
                    className="block"
                  />
                </p>
              </div>
            ))}
            <button type="button" className={addBtn} onClick={addReference}>
              + Add reference
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
