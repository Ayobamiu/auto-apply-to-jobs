import { isEqual } from "lodash";
import { Sparkles } from "lucide-react";
import { DiffView } from "../components/DiffView";
import { ResumeEditForm } from "./forms/ResumeEditForm";

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

export interface ResumeDocumentProps {
  resume: Record<string, unknown>;
  onChange: (resume: Record<string, unknown>) => void;
  compact?: boolean;
  readOnly?: boolean;
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
  /** The committed resume before patches — when provided, diff mode is active. */
  baseResume?: Record<string, unknown>;
}

export function ResumeDocument({
  resume,
  onChange,
  compact = false,
  readOnly = false,
  disableSelection = false,
  selectedNode,
  setSelectedNode,
  baseResume,
}: ResumeDocumentProps) {
  const reviewing = !!baseResume;

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

  const baseBasics = baseResume
    ? ((baseResume.basics as Record<string, unknown>) ?? {})
    : null;
  const baseLocation = baseBasics ? (getObj(baseBasics, "location") ?? {}) : null;

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

    const handleSelect = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (disableSelection) return;
      if (isSelected) {
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
        `}
      >
        {isSelected && type === "block" && (
          <span className="absolute -top-3 left-4 z-20 bg-slate-900 text-white text-[10px]  py-0.5 rounded-full uppercase tracking-widest font-bold animate-in fade-in zoom-in duration-200">
            AI FOCUS: {label}
          </span>
        )}

        {isSelected && type === "highlight" && (
          <div className="absolute -left-6 top-1/2 -translate-y-1/2 z-30">
            <div className="flex items-center justify-center w-5 h-5 bg-slate-600 text-amber-300 rounded-full shadow-lg animate-in zoom-in spin-in-90 duration-300">
              <Sparkles size={12} fill="currentColor" />
            </div>
            <div className="absolute left-5 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-slate-900/20" />
          </div>
        )}

        {children}
      </div>
    );
  };

  // ── Two-resume diff helpers ──

  /** Compare a string field between preview and base, rendering a diff when they differ. */
  const diffField = (previewValue: string, baseValue: string | undefined): React.ReactNode => {
    if (!reviewing || baseValue === undefined) return <span>{previewValue}</span>;
    if (previewValue === baseValue) return <span>{previewValue}</span>;
    if (!baseValue && previewValue) {
      return (
        <span className="bg-emerald-100 text-emerald-900 px-0.5 rounded shadow-sm border-b-2 border-emerald-400">
          {previewValue}
        </span>
      );
    }
    if (baseValue && !previewValue) {
      return (
        <span className="bg-rose-100 text-rose-800 line-through opacity-70 px-0.5">
          {baseValue}
        </span>
      );
    }
    return <DiffView original={baseValue} proposed={previewValue} />;
  };

  /** Check if a preview item exists in the base array (structural equality). */
  const isNewItem = (item: unknown, baseArray: unknown[]): boolean =>
    !baseArray.some((b) => isEqual(b, item));

  /** Get items from baseArray that were removed (not in previewArray). */
  const getRemovedItems = <T,>(baseArray: T[], previewArray: T[]): T[] =>
    baseArray.filter((b) => !previewArray.some((p) => isEqual(p, b)));

  /** Diff highlight bullets between preview and base arrays. */
  const diffHighlights = (
    section: string,
    i: number,
    previewHighlights: string[],
    baseHighlights: string[],
    highlightLabel: string,
  ): React.ReactNode => {
    if (previewHighlights.length === 0 && baseHighlights.length === 0) return null;

    if (!reviewing || isEqual(previewHighlights, baseHighlights)) {
      if (previewHighlights.length === 0) return null;
      return (
        <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2 space-y-0.5">
          {previewHighlights.map((h, j) => (
            <SectionWrapper
              key={j}
              path={`${section}[${i}].highlights[${j}]`}
              label={highlightLabel}
              data={h}
              type="highlight"
            >
              <li>{h}</li>
            </SectionWrapper>
          ))}
        </ul>
      );
    }

    const rows: React.ReactNode[] = [];
    const maxLen = Math.max(previewHighlights.length, baseHighlights.length);
    for (let j = 0; j < maxLen; j++) {
      const prev = previewHighlights[j];
      const base = baseHighlights[j];

      if (prev !== undefined && base === undefined) {
        rows.push(
          <SectionWrapper
            key={`add-${j}`}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={prev}
            type="highlight"
          >
            <li className="bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-300 pl-1 -ml-0.5 rounded">
              {prev}
            </li>
          </SectionWrapper>,
        );
      } else if (prev === undefined && base !== undefined) {
        rows.push(
          <SectionWrapper
            key={`rm-${j}`}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={base}
            type="highlight"
          >
            <li className="line-through opacity-70 text-rose-900/80 bg-rose-50/40 border-l-2 border-rose-300 pl-1 -ml-0.5 rounded">
              {base}
            </li>
          </SectionWrapper>,
        );
      } else if (prev !== undefined && base !== undefined && prev !== base) {
        rows.push(
          <SectionWrapper
            key={j}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={base}
            type="highlight"
          >
            <li>
              <DiffView original={base} proposed={prev} />
            </li>
          </SectionWrapper>,
        );
      } else if (prev !== undefined) {
        rows.push(
          <SectionWrapper
            key={j}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={prev}
            type="highlight"
          >
            <li>{prev}</li>
          </SectionWrapper>,
        );
      }
    }

    return (
      <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2 space-y-0.5">
        {rows}
      </ul>
    );
  };

  const NewBadge = () => (
    <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
      New
    </span>
  );
  const RemovingBadge = () => (
    <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
      Removing
    </span>
  );

  const sectionHeading =
    "text-xs font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1.5";

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

    const baseCity = baseLocation ? getStr(baseLocation, "city") : undefined;
    const baseRegion = baseLocation ? getStr(baseLocation, "region") : undefined;
    const basePhone = baseBasics ? getStr(baseBasics, "phone") : undefined;
    const baseEmail = baseBasics ? getStr(baseBasics, "email") : undefined;

    const contactSegments: JSX.Element[] = [];
    if (city || region) {
      contactSegments.push(
        <span key="city-region">
          {diffField(city, baseCity)}
          {city && region ? ", " : ""}
          {diffField(region, baseRegion)}
        </span>,
      );
    }
    if (phone) {
      contactSegments.push(
        <span key="phone">{diffField(phone, basePhone)}</span>,
      );
    }
    if (email) {
      contactSegments.push(
        <span key="email">{diffField(email, baseEmail)}</span>,
      );
    }
    if (profiles.length > 0) {
      profiles.forEach((pro, index) => {
        const profileUrl = getStr(pro, "url");
        const network = getStr(pro, "network");
        if (profileUrl)
          contactSegments.push(
            <a
              key={`profile-${index}`}
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {network
                ? `${network}: ${profileUrl.replace(/^https?:\/\//, "")}`
                : profileUrl.replace(/^https?:\/\//, "")}
            </a>,
          );
      });
    }
    const url = getStr(basics, "url");
    if (url) {
      contactSegments.push(
        <span key="url">
          Website: {diffField(url.replace(/^https?:\/\//, ""), baseBasics ? getStr(baseBasics, "url").replace(/^https?:\/\//, "") : undefined)}
        </span>,
      );
    }
    const contactLine =
      contactSegments.length > 0
        ? contactSegments.reduce<(JSX.Element | string)[]>(
            (acc, seg, i) => (i === 0 ? [seg] : [...acc, sepP(), seg]),
            [],
          )
        : null;
    const summary = getStr(getObj(resume, "basics"), "summary");
    const baseSummary = baseBasics ? getStr(baseBasics, "summary") : undefined;

    // Base arrays for diff detection
    const baseWork = baseResume ? getArr<Record<string, unknown>>(baseResume, "work") : work;
    const baseVolunteer = baseResume ? getArr<Record<string, unknown>>(baseResume, "volunteer") : volunteer;
    const baseEducation = baseResume ? getArr<Record<string, unknown>>(baseResume, "education") : education;
    const baseProjects = baseResume ? getArr<Record<string, unknown>>(baseResume, "projects") : projects;
    const baseSkills = baseResume ? getArr<Record<string, unknown>>(baseResume, "skills") : skills;

    /** Render a work/volunteer/project-like entry with diff awareness. */
    const renderExperienceItem = (
      section: string,
      entry: Record<string, unknown>,
      i: number,
      baseArray: Record<string, unknown>[],
      nameKey: string,
      labelPrefix: string,
      highlightLabel: string,
      renderContent: (
        entry: Record<string, unknown>,
        baseEntry: Record<string, unknown> | null,
        i: number,
      ) => React.ReactNode,
    ) => {
      const itemIsNew = reviewing && isNewItem(entry, baseArray);

      return (
        <SectionWrapper
          key={i}
          path={`${section}[${i}]`}
          label={`${labelPrefix}: ${getStr(entry, nameKey).slice(0, 10)}...`}
          data={JSON.stringify(entry)}
        >
          <div
            className={`${compact ? "mb-2" : "mb-3"} relative ${
              itemIsNew ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2" : ""
            }`}
          >
            {itemIsNew && <NewBadge />}
            {renderContent(
              entry,
              itemIsNew ? null : findBaseEntry(entry, baseArray, nameKey),
              i,
            )}
          </div>
        </SectionWrapper>
      );
    };

    /** Find the matching base entry by a stable identity key. */
    const findBaseEntry = (
      previewEntry: Record<string, unknown>,
      baseArray: Record<string, unknown>[],
      ...keys: string[]
    ): Record<string, unknown> | null => {
      if (!reviewing) return null;
      const match = baseArray.find((b) =>
        keys.some((k) => getStr(b, k) && getStr(b, k) === getStr(previewEntry, k)),
      );
      if (match) return match;
      return isEqual(previewEntry, baseArray[0]) ? baseArray[0] : null;
    };

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
                  {diffField(getStr(basics, "name") || "\u00A0", baseBasics ? (getStr(baseBasics, "name") || "\u00A0") : undefined)}
                </h1>
                {getStr(basics, "label") && !summary ? (
                  <p className="text-sm font-semibold text-gray-900">
                    {diffField(getStr(basics, "label"), baseBasics ? getStr(baseBasics, "label") : undefined)}
                  </p>
                ) : null}
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
                  {getStr(basics, "label") && summary ? (
                    <p className="text-sm font-semibold text-gray-900">
                      {diffField(getStr(basics, "label"), baseBasics ? getStr(baseBasics, "label") : undefined)}
                    </p>
                  ) : null}
                </SectionWrapper>
                <SectionWrapper
                  path="basics.summary"
                  label="Professional Summary"
                  data={summary}
                >
                  {(summary || baseSummary) ? (
                    <div className="mt-0.5 text-sm">
                      {diffField(summary, baseSummary)}
                    </div>
                  ) : null}
                </SectionWrapper>
              </div>
            </header>

            {/* ── Experience ── */}
            {work.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Experience</h2>
                {work.map((entry, i) =>
                  renderExperienceItem(
                    "work", entry, i, baseWork, "name", "Experience", "Specific Achievement",
                    (entry, baseEntry, idx) => {
                      const loc = getStr(entry, "location");
                      const start = getStr(entry, "startDate");
                      const end = getStr(entry, "endDate");
                      const highlights = getArr<string>(entry, "highlights").filter(Boolean);
                      const hasMeta = loc || start || end;
                      const baseHighlights = baseEntry
                        ? getArr<string>(baseEntry, "highlights").filter(Boolean)
                        : highlights;
                      return (
                        <>
                          <p className="text-sm">
                            <span className="text-gray-700">
                              {diffField(getStr(entry, "position"), baseEntry ? getStr(baseEntry, "position") : undefined)}
                            </span>
                            {getStr(entry, "position") && getStr(entry, "name") ? sepP() : null}
                            <span className="font-semibold">
                              {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                            </span>
                            {hasMeta ? sepP() : null}
                            <span className="text-gray-500">
                              {diffField(loc, baseEntry ? getStr(baseEntry, "location") : undefined)}
                            </span>
                            {loc && (start || end) ? sepP() : null}
                            <span className="text-gray-500">
                              {diffField(start, baseEntry ? getStr(baseEntry, "startDate") : undefined)}
                              {start && end ? " – " : start ? " – " : ""}
                              {end
                                ? diffField(end, baseEntry ? getStr(baseEntry, "endDate") : undefined)
                                : start
                                  ? "Present"
                                  : ""}
                            </span>
                          </p>
                          {(getStr(entry, "summary") || (baseEntry && getStr(baseEntry, "summary"))) && (
                            <p className="text-sm text-gray-700 mt-0.5">
                              {diffField(getStr(entry, "summary"), baseEntry ? getStr(baseEntry, "summary") : undefined)}
                            </p>
                          )}
                          {diffHighlights("work", idx, highlights, baseHighlights, "Specific Achievement")}
                        </>
                      );
                    },
                  ),
                )}
                {/* Removed work items */}
                {reviewing &&
                  getRemovedItems(baseWork, work).map((entry, k) => (
                    <div
                      key={`rm-work-${k}`}
                      className="mb-3 relative line-through opacity-60 bg-rose-50/50 rounded p-1"
                    >
                      <RemovingBadge />
                      <p className="text-sm mt-1">
                        <span className="text-gray-700">{getStr(entry, "position")}</span>
                        {getStr(entry, "position") && getStr(entry, "name") ? sepP() : null}
                        <span className="font-semibold">{getStr(entry, "name")}</span>
                      </p>
                    </div>
                  ))}
              </section>
            )}

            {/* ── Volunteer ── */}
            {volunteer.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Volunteer</h2>
                {volunteer.map((entry, i) =>
                  renderExperienceItem(
                    "volunteer", entry, i, baseVolunteer, "organization", "Volunteer", "Volunteer Highlight",
                    (entry, baseEntry, idx) => {
                      const highlights = getArr<string>(entry, "highlights").filter(Boolean);
                      const baseHighlights = baseEntry
                        ? getArr<string>(baseEntry, "highlights").filter(Boolean)
                        : highlights;
                      return (
                        <>
                          <p className="text-sm">
                            <span className="text-gray-700">
                              {diffField(getStr(entry, "position"), baseEntry ? getStr(baseEntry, "position") : undefined)}
                            </span>
                            {getStr(entry, "position") && getStr(entry, "organization") ? sepP() : null}
                            <span className="font-semibold">
                              {diffField(getStr(entry, "organization"), baseEntry ? getStr(baseEntry, "organization") : undefined)}
                            </span>
                          </p>
                          <p className="text-gray-500 text-sm mt-0.5">
                            {diffField(getStr(entry, "startDate"), baseEntry ? getStr(baseEntry, "startDate") : undefined)}
                            {getStr(entry, "startDate") ? " – " : ""}
                            {getStr(entry, "endDate")
                              ? diffField(getStr(entry, "endDate"), baseEntry ? getStr(baseEntry, "endDate") : undefined)
                              : getStr(entry, "startDate")
                                ? "Present"
                                : ""}
                          </p>
                          {(getStr(entry, "summary") || (baseEntry && getStr(baseEntry, "summary"))) && (
                            <p className="text-sm text-gray-700 mt-0.5">
                              {diffField(getStr(entry, "summary"), baseEntry ? getStr(baseEntry, "summary") : undefined)}
                            </p>
                          )}
                          {diffHighlights("volunteer", idx, highlights, baseHighlights, "Volunteer Highlight")}
                        </>
                      );
                    },
                  ),
                )}
                {reviewing &&
                  getRemovedItems(baseVolunteer, volunteer).map((entry, k) => (
                    <div
                      key={`rm-vol-${k}`}
                      className="mb-3 relative line-through opacity-60 bg-rose-50/50 rounded p-1"
                    >
                      <RemovingBadge />
                      <p className="text-sm mt-1">
                        <span className="text-gray-700">{getStr(entry, "position")}</span>
                        {getStr(entry, "position") && getStr(entry, "organization") ? sepP() : null}
                        <span className="font-semibold">{getStr(entry, "organization")}</span>
                      </p>
                    </div>
                  ))}
              </section>
            )}

            {/* ── Education ── */}
            {education.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Education</h2>
                {education.map((entry, i) => {
                  const itemIsNew = reviewing && isNewItem(entry, baseEducation);
                  const baseEntry = itemIsNew
                    ? null
                    : baseEducation.find(
                        (b) =>
                          (getStr(b, "institution") && getStr(b, "institution") === getStr(entry, "institution")) ||
                          isEqual(b, entry),
                      ) ?? null;
                  const courses = getArr<string>(entry, "courses").filter(Boolean);
                  const baseCourses = baseEntry
                    ? getArr<string>(baseEntry, "courses").filter(Boolean)
                    : courses;

                  return (
                    <SectionWrapper
                      key={i}
                      path={`education[${i}]`}
                      label={`Education: ${getStr(entry, "institution").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div
                        className={`${compact ? "mb-2" : "mb-3"} relative ${
                          itemIsNew ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2" : ""
                        }`}
                      >
                        {itemIsNew && <NewBadge />}
                        <p className="font-semibold text-sm">
                          {diffField(getStr(entry, "institution"), baseEntry ? getStr(baseEntry, "institution") : undefined)}
                        </p>
                        <p className="text-gray-600 text-sm mt-0.5">
                          {diffField(getStr(entry, "studyType"), baseEntry ? getStr(baseEntry, "studyType") : undefined)}
                          {getStr(entry, "studyType") && getStr(entry, "area") ? ", " : null}
                          {diffField(getStr(entry, "area"), baseEntry ? getStr(baseEntry, "area") : undefined)}
                          {(getStr(entry, "area") || getStr(entry, "studyType")) &&
                          (getStr(entry, "startDate") || getStr(entry, "endDate"))
                            ? " · "
                            : null}
                          {diffField(getStr(entry, "startDate"), baseEntry ? getStr(baseEntry, "startDate") : undefined)}
                          {getStr(entry, "startDate") ? " – " : ""}
                          {getStr(entry, "endDate")
                            ? diffField(getStr(entry, "endDate"), baseEntry ? getStr(baseEntry, "endDate") : undefined)
                            : getStr(entry, "startDate")
                              ? "Present"
                              : ""}
                          {getStr(entry, "score") ? (
                            <>
                              {" · GPA: "}
                              {diffField(getStr(entry, "score"), baseEntry ? getStr(baseEntry, "score") : undefined)}
                            </>
                          ) : null}
                        </p>
                        {(courses.length > 0 || baseCourses.length > 0) && (
                          <p className="text-gray-500 text-sm mt-0.5">
                            Courses:{" "}
                            {diffField(courses.join(", "), reviewing ? baseCourses.join(", ") : undefined)}
                          </p>
                        )}
                      </div>
                    </SectionWrapper>
                  );
                })}
                {reviewing &&
                  getRemovedItems(baseEducation, education).map((entry, k) => (
                    <div
                      key={`rm-edu-${k}`}
                      className="mb-3 relative line-through opacity-60 bg-rose-50/50 rounded p-1"
                    >
                      <RemovingBadge />
                      <p className="font-semibold text-sm mt-1">{getStr(entry, "institution")}</p>
                      <p className="text-gray-600 text-sm">
                        {getStr(entry, "studyType")}
                        {getStr(entry, "studyType") && getStr(entry, "area") ? ", " : ""}
                        {getStr(entry, "area")}
                      </p>
                    </div>
                  ))}
              </section>
            )}

            {/* ── Projects ── */}
            {projects.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Projects</h2>
                {projects.map((entry, i) =>
                  renderExperienceItem(
                    "projects", entry, i, baseProjects, "name", "Project", "Project Highlight",
                    (entry, baseEntry, idx) => {
                      const highlights = getArr<string>(entry, "highlights").filter(Boolean);
                      const baseHighlights = baseEntry
                        ? getArr<string>(baseEntry, "highlights").filter(Boolean)
                        : highlights;
                      return (
                        <>
                          <p className="font-semibold text-sm">
                            {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                            {getStr(entry, "url") && (
                              <span className="font-normal text-gray-500">
                                {" — "}
                                {diffField(
                                  getStr(entry, "url").replace(/^https?:\/\//, ""),
                                  baseEntry ? getStr(baseEntry, "url").replace(/^https?:\/\//, "") : undefined,
                                )}
                              </span>
                            )}
                          </p>
                          {(getStr(entry, "description") || (baseEntry && getStr(baseEntry, "description"))) && (
                            <p className="text-gray-600 text-sm mt-0.5">
                              {diffField(getStr(entry, "description"), baseEntry ? getStr(baseEntry, "description") : undefined)}
                            </p>
                          )}
                          {diffHighlights("projects", idx, highlights, baseHighlights, "Project Highlight")}
                        </>
                      );
                    },
                  ),
                )}
                {reviewing &&
                  getRemovedItems(baseProjects, projects).map((entry, k) => (
                    <div
                      key={`rm-proj-${k}`}
                      className="mb-3 relative line-through opacity-60 bg-rose-50/50 rounded p-1"
                    >
                      <RemovingBadge />
                      <p className="font-semibold text-sm mt-1">{getStr(entry, "name")}</p>
                    </div>
                  ))}
              </section>
            )}

            {/* ── Skills ── */}
            {skills.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Skills</h2>
                {skills.map((entry, i) => {
                  const kws = getArr<string>(entry, "keywords").filter(Boolean);
                  const kwStr = kws.join(", ");
                  const baseEntry = reviewing
                    ? baseSkills.find(
                        (b) => getStr(b, "name") && getStr(b, "name") === getStr(entry, "name"),
                      ) ?? null
                    : null;
                  const baseKwStr = baseEntry
                    ? getArr<string>(baseEntry, "keywords").filter(Boolean).join(", ")
                    : undefined;
                  const itemIsNew = reviewing && isNewItem(entry, baseSkills);

                  if (compact) {
                    return (
                      <SectionWrapper
                        key={i}
                        path={`skills[${i}]`}
                        label={`Skill: ${getStr(entry, "name").slice(0, 10)}...`}
                        data={JSON.stringify(entry)}
                      >
                        <div
                          className={`mb-1.5 text-sm ${
                            itemIsNew ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1 relative" : ""
                          }`}
                        >
                          {itemIsNew && <NewBadge />}
                          <span className="font-semibold">
                            {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                          </span>
                          {getStr(entry, "name") && kwStr ? ": " : null}
                          {reviewing && baseKwStr !== undefined && kwStr !== baseKwStr ? (
                            <DiffView original={baseKwStr} proposed={kwStr} />
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
                      <div
                        className={`mb-3 ${
                          itemIsNew ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1 relative" : ""
                        }`}
                      >
                        {itemIsNew && <NewBadge />}
                        <p className="font-semibold text-sm">
                          {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                        </p>
                        <p className="text-gray-700 text-sm mt-0.5">
                          {reviewing && baseKwStr !== undefined && kwStr !== baseKwStr ? (
                            <DiffView original={baseKwStr} proposed={kwStr} />
                          ) : (
                            kwStr || "\u00A0"
                          )}
                        </p>
                      </div>
                    </SectionWrapper>
                  );
                })}
                {reviewing &&
                  getRemovedItems(baseSkills, skills).map((entry, k) => (
                    <div
                      key={`rm-skill-${k}`}
                      className="mb-1.5 relative line-through opacity-60 bg-rose-50/50 rounded p-1"
                    >
                      <RemovingBadge />
                      <span className="font-semibold text-sm">{getStr(entry, "name")}</span>
                      {getStr(entry, "name") &&
                      getArr<string>(entry, "keywords").filter(Boolean).length > 0
                        ? ": "
                        : null}
                      <span className="text-sm">
                        {getArr<string>(entry, "keywords").filter(Boolean).join(", ")}
                      </span>
                    </div>
                  ))}
              </section>
            )}

            {/* ── Languages ── */}
            {languages.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Languages</h2>
                {languages.map((entry, i) => {
                  const baseArr = baseResume ? getArr<Record<string, unknown>>(baseResume, "languages") : languages;
                  const baseEntry = reviewing
                    ? baseArr.find(
                        (b) => getStr(b, "language") && getStr(b, "language") === getStr(entry, "language"),
                      ) ?? null
                    : null;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`languages[${i}]`}
                      label={`Language: ${getStr(entry, "language").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`${compact ? "mb-1.5" : "mb-3"} text-sm`}>
                        {diffField(getStr(entry, "language"), baseEntry ? getStr(baseEntry, "language") : undefined)}
                        {" — "}
                        {diffField(getStr(entry, "fluency"), baseEntry ? getStr(baseEntry, "fluency") : undefined)}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}

            {/* ── Certificates ── */}
            {certificates.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Certificates</h2>
                {certificates.map((entry, i) => {
                  const baseArr = baseResume ? getArr<Record<string, unknown>>(baseResume, "certificates") : certificates;
                  const baseEntry = reviewing
                    ? baseArr.find(
                        (b) => getStr(b, "name") && getStr(b, "name") === getStr(entry, "name"),
                      ) ?? null
                    : null;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`certificates[${i}]`}
                      label={`Certificate: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                        <span className="font-semibold">
                          {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                        </span>
                        {getStr(entry, "name") && getStr(entry, "issuer") ? " – " : null}
                        {diffField(getStr(entry, "issuer"), baseEntry ? getStr(baseEntry, "issuer") : undefined)}
                        {getStr(entry, "issuer") && getStr(entry, "date") ? ", " : null}
                        {diffField(getStr(entry, "date"), baseEntry ? getStr(baseEntry, "date") : undefined)}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}

            {/* ── Awards ── */}
            {awards.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Awards</h2>
                {awards.map((entry, i) => {
                  const baseArr = baseResume ? getArr<Record<string, unknown>>(baseResume, "awards") : awards;
                  const baseEntry = reviewing
                    ? baseArr.find(
                        (b) => getStr(b, "title") && getStr(b, "title") === getStr(entry, "title"),
                      ) ?? null
                    : null;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`awards[${i}]`}
                      label={`Award: ${getStr(entry, "title").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                        <span className="font-semibold">
                          {diffField(getStr(entry, "title"), baseEntry ? getStr(baseEntry, "title") : undefined)}
                        </span>
                        {getStr(entry, "title") && getStr(entry, "awarder") ? " – " : null}
                        {diffField(getStr(entry, "awarder"), baseEntry ? getStr(baseEntry, "awarder") : undefined)}
                        {getStr(entry, "awarder") && getStr(entry, "date") ? ", " : null}
                        {diffField(getStr(entry, "date"), baseEntry ? getStr(baseEntry, "date") : undefined)}
                        {getStr(entry, "summary") ? (
                          <p className="text-gray-700 mt-0.5">
                            {diffField(getStr(entry, "summary"), baseEntry ? getStr(baseEntry, "summary") : undefined)}
                          </p>
                        ) : null}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}

            {/* ── Publications ── */}
            {publications.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Publications</h2>
                {publications.map((entry, i) => {
                  const baseArr = baseResume ? getArr<Record<string, unknown>>(baseResume, "publications") : publications;
                  const baseEntry = reviewing
                    ? baseArr.find(
                        (b) => getStr(b, "name") && getStr(b, "name") === getStr(entry, "name"),
                      ) ?? null
                    : null;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`publications[${i}]`}
                      label={`Publication: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`text-sm ${compact ? "mb-1.5" : "mb-3"}`}>
                        <span className="font-semibold">
                          {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                        </span>
                        {getStr(entry, "name") && getStr(entry, "publisher") ? " – " : null}
                        {diffField(getStr(entry, "publisher"), baseEntry ? getStr(baseEntry, "publisher") : undefined)}
                        {getStr(entry, "publisher") && getStr(entry, "releaseDate") ? ", " : null}
                        {diffField(getStr(entry, "releaseDate"), baseEntry ? getStr(baseEntry, "releaseDate") : undefined)}
                        {getStr(entry, "summary") ? (
                          <p className="text-gray-700 mt-0.5">
                            {diffField(getStr(entry, "summary"), baseEntry ? getStr(baseEntry, "summary") : undefined)}
                          </p>
                        ) : null}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}

            {/* ── Interests ── */}
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
                        <span className="font-semibold">
                          {getStr(entry, "name")}
                        </span>
                        {getStr(entry, "name") && kw ? ": " : null}
                        {kw || null}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}

            {/* ── References ── */}
            {references.length > 0 && (
              <section className="resume-section">
                <h2 className={sectionHeading}>References</h2>
                {references.map((entry, i) => {
                  const baseArr = baseResume ? getArr<Record<string, unknown>>(baseResume, "references") : references;
                  const baseEntry = reviewing
                    ? baseArr.find(
                        (b) => getStr(b, "name") && getStr(b, "name") === getStr(entry, "name"),
                      ) ?? null
                    : null;
                  return (
                    <SectionWrapper
                      key={i}
                      path={`references[${i}]`}
                      label={`Reference: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={compact ? "mb-1.5" : "mb-3"}>
                        <p className="font-semibold text-sm">
                          {diffField(getStr(entry, "name"), baseEntry ? getStr(baseEntry, "name") : undefined)}
                        </p>
                        {getStr(entry, "reference") ? (
                          <p className="text-sm text-gray-700 mt-0.5">
                            {diffField(getStr(entry, "reference"), baseEntry ? getStr(baseEntry, "reference") : undefined)}
                          </p>
                        ) : null}
                      </div>
                    </SectionWrapper>
                  );
                })}
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <ResumeEditForm resume={resume} onChange={onChange} />;
}
