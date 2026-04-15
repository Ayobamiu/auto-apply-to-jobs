import {
  getProposedValueForPath,
  isPathUnderPatch,
  getAddPatchesForArray,
  getAddPatchesForSubArray,
  getRemovePatchForPath,
  getMovePatchFrom,
  getMovePatchTo,
  type ProposedPatch,
} from "./utils";
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

  /** Preview AI changes to highlights: append, per-line replace, tail removal, or whole-list diff. */
  const renderHighlightBulletList = (
    section: "work" | "volunteer" | "projects",
    i: number,
    highlights: string[],
    highlightLabel: string,
    subAddPatches: ProposedPatch[],
  ) => {
    const blockPath = `${section}[${i}]`;
    const blockMatch = getProposedValueForPath(blockPath, proposedPatches);
    const rawProposed = blockMatch?.proposed;
    const hlRaw =
      rawProposed != null && typeof rawProposed === "object"
        ? (rawProposed as { highlights?: unknown }).highlights
        : undefined;
    /** null = no highlight array on the proposed block — do not infer removals (fixes false "all crossed out"). */
    const highlightsExplicitlyProposed = Array.isArray(hlRaw);
    const proposedHighlights: string[] | null = highlightsExplicitlyProposed
      ? (hlRaw as unknown[]).filter((x): x is string => typeof x === "string" && Boolean(x))
      : null;

    const proposedArr = proposedHighlights ?? [];
    const covered = new Set(proposedArr);
    const extraSubAdds = subAddPatches.filter((p) => {
      const s = typeof p.value === "string" ? p.value : "";
      return s && !covered.has(s);
    });

    const simpleAppend =
      proposedHighlights != null &&
      proposedArr.length >= highlights.length &&
      highlights.every((v, idx) => proposedArr[idx] === v);

    if (
      proposedHighlights != null &&
      proposedArr.length > 0 &&
      proposedArr.length !== highlights.length &&
      !simpleAppend
    ) {
      const joinedH = highlights.join("\n");
      const joinedP = proposedArr.join("\n");
      if (joinedH !== joinedP) {
        return (
          <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2 space-y-0.5">
            <li className="list-none -ml-2">
              <DiffView original={joinedH || "(none)"} proposed={joinedP} />
            </li>
            {extraSubAdds.map((p, k) => (
              <li
                key={`subadd-${k}`}
                className="bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-300 pl-1 -ml-0.5 rounded"
              >
                {typeof p.value === "string" ? p.value : JSON.stringify(p.value)}
              </li>
            ))}
          </ul>
        );
      }
    }

    const maxLen = Math.max(highlights.length, proposedArr.length);
    if (maxLen === 0 && extraSubAdds.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (let j = 0; j < maxLen; j++) {
      const h = highlights[j];
      let prop = proposedHighlights != null ? proposedHighlights[j] : undefined;
      if (prop === undefined && typeof h === "string") {
        const leaf = getProposedValueForPath(
          `${section}[${i}].highlights[${j}]`,
          proposedPatches,
        );
        if (leaf?.proposed !== undefined && typeof leaf.proposed === "string") {
          prop = leaf.proposed;
        }
      }
      if (h === undefined && prop === undefined) continue;

      // Only show "removed" when the proposal explicitly includes fewer bullets than now (tail shrink).
      if (
        proposedHighlights != null &&
        typeof h === "string" &&
        prop === undefined &&
        proposedHighlights.length < highlights.length &&
        j >= proposedHighlights.length
      ) {
        rows.push(
          <SectionWrapper
            key={`rm-${j}`}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={h}
            type="highlight"
          >
            <li className="line-through opacity-70 text-rose-900/80 bg-rose-50/40 border-l-2 border-rose-300 pl-1 -ml-0.5 rounded">
              {h}
            </li>
          </SectionWrapper>,
        );
        continue;
      }

      if (h === undefined && typeof prop === "string") {
        rows.push(
          <SectionWrapper
            key={`add-${j}`}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={prop}
            type="highlight"
          >
            <li className="bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-300 pl-1 -ml-0.5 rounded">
              {prop}
            </li>
          </SectionWrapper>,
        );
        continue;
      }

      if (typeof h === "string" && typeof prop === "string" && h !== prop) {
        rows.push(
          <SectionWrapper
            key={j}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={h}
            type="highlight"
          >
            <li>
              <DiffView original={h} proposed={prop} />
            </li>
          </SectionWrapper>,
        );
        continue;
      }

      if (typeof h === "string") {
        rows.push(
          <SectionWrapper
            key={j}
            path={`${section}[${i}].highlights[${j}]`}
            label={highlightLabel}
            data={h}
            type="highlight"
          >
            <li>{renderField(`${section}[${i}].highlights[${j}]`, h)}</li>
          </SectionWrapper>,
        );
      }
    }
    extraSubAdds.forEach((p, k) => {
      rows.push(
        <li
          key={`subadd-extra-${k}`}
          className="bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-300 pl-1 -ml-0.5 rounded"
        >
          {typeof p.value === "string" ? p.value : JSON.stringify(p.value)}
        </li>,
      );
    });
    return (
      <ul className="list-disc list-inside text-sm text-gray-700 mt-0.5 ml-2 space-y-0.5">
        {rows}
      </ul>
    );
  };

  /** When AI changes reorder the whole section, we collapse to one replace(/work) patch — render that list so order matches preview. */
  const displaySectionList = (
    section: "work" | "volunteer" | "education" | "projects",
    list: Record<string, unknown>[],
  ): Record<string, unknown>[] => {
    const rep = proposedPatches.find((p) => {
      if (p.op !== "replace") return false;
      const n = p.path.startsWith("/") ? p.path.slice(1) : p.path;
      return n === section || p.path === `/${section}`;
    });
    if (rep && Array.isArray(rep.value)) {
      return rep.value as Record<string, unknown>[];
    }
    return list;
  };

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
        <span key="phone">{renderField("basics.phone", phone)}</span>,
      );
    }
    if (email) {
      contactSegments.push(
        <span key="email">{renderField("basics.email", email)}</span>,
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
              {renderField(
                `basics.profiles[${index}].url`,
                network
                  ? `${network}: ${profileUrl.replace(/^https?:\/\//, "")}`
                  : profileUrl.replace(/^https?:\/\//, ""),
              )}
            </a>,
          );
      });
    }
    const url = getStr(basics, "url");
    if (url) {
      contactSegments.push(
        <span key="url">
          Website: {renderField("basics.url", url.replace(/^https?:\/\//, ""))}
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
                {getStr(basics, "label") && !summary ? (
                  <p className="text-sm font-semibold text-gray-900">
                    {getStr(basics, "label")}
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
            {(work.length > 0 ||
              getAddPatchesForArray("work", proposedPatches).length > 0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Experience</h2>
                {displaySectionList("work", work).map((entry, i) => {
                  const loc = getStr(entry, "location");
                  const start = getStr(entry, "startDate");
                  const end = getStr(entry, "endDate");
                  const highlights = getArr<string>(entry, "highlights").filter(
                    Boolean,
                  );
                  const hasMeta = loc || start || end;
                  const removePatch = getRemovePatchForPath(`work[${i}]`, proposedPatches);
                  const moveFrom = getMovePatchFrom(`work[${i}]`, proposedPatches);
                  const moveTo = getMovePatchTo(`work[${i}]`, proposedPatches);
                  const subAddPatches = getAddPatchesForSubArray(`work.${i}.highlights`, proposedPatches);
                  return (
                    <SectionWrapper
                      key={i}
                      path={`work[${i}]`}
                      label={`Experience: ${getStr(entry, "name").slice(0, 10)}...`}
                      data={JSON.stringify(entry)}
                    >
                      <div className={`${compact ? "mb-2" : "mb-3"} relative ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1" : ""} ${moveFrom ? "opacity-60 bg-amber-50/50 rounded p-1" : ""} ${moveTo ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1" : ""}`}>
                        {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                        {moveFrom && <span className="absolute -top-2.5 left-3 text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moving</span>}
                        {moveTo && <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moved here</span>}
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
                            {start && end ? " – " : start ? " – " : ""}
                            {end
                              ? renderField(`work[${i}].endDate`, end)
                              : start
                                ? "Present"
                                : ""}
                          </span>
                        </p>
                        {getStr(entry, "summary") && (
                          <p className="text-sm text-gray-700 mt-0.5">
                            {renderField(
                              `work[${i}].summary`,
                              getStr(entry, "summary"),
                            )}
                          </p>
                        )}
                        {renderHighlightBulletList(
                          "work",
                          i,
                          highlights,
                          "Specific Achievement",
                          subAddPatches,
                        )}
                      </div>
                    </SectionWrapper>
                  );
                })}
                {getAddPatchesForArray("work", proposedPatches).map(
                  (patch, k) => {
                    const v = patch.value as Record<string, unknown>;
                    const hl = Array.isArray(v?.highlights)
                      ? (v.highlights as string[])
                      : [];
                    return (
                      <div
                        key={`add-work-${k}`}
                        className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2"
                      >
                        <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          New
                        </span>
                        <p className="text-sm mt-1">
                          <span className="text-gray-700">
                            {(v?.position as string) ?? ""}
                          </span>
                          {v?.position && v?.name ? (
                            <span className="text-gray-400 mx-1">|</span>
                          ) : null}
                          <span className="font-semibold">
                            {(v?.name as string) ?? ""}
                          </span>
                          {v?.startDate ? (
                            <span className="text-gray-400 mx-1">|</span>
                          ) : null}
                          <span className="text-gray-500">
                            {(v?.startDate as string) ?? ""}
                            {v?.startDate && v?.endDate ? " – " : ""}
                            {(v?.endDate as string) ?? ""}
                          </span>
                        </p>
                        {hl.length > 0 && (
                          <ul className="list-disc list-inside text-sm text-emerald-900 mt-0.5 ml-2 space-y-0.5">
                            {hl.map((h, j) => (
                              <li key={j}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  },
                )}
              </section>
            )}
            {(volunteer.length > 0 ||
              getAddPatchesForArray("volunteer", proposedPatches).length >
                0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Volunteer</h2>
                {displaySectionList("volunteer", volunteer).map((entry, i) => {
                  const removePatch = getRemovePatchForPath(`volunteer[${i}]`, proposedPatches);
                  const moveFrom = getMovePatchFrom(`volunteer[${i}]`, proposedPatches);
                  const moveTo = getMovePatchTo(`volunteer[${i}]`, proposedPatches);
                  const highlights = getArr<string>(entry, "highlights").filter(Boolean);
                  const subAddPatches = getAddPatchesForSubArray(`volunteer.${i}.highlights`, proposedPatches);
                  return (
                  <SectionWrapper
                    key={i}
                    path={`volunteer[${i}]`}
                    label={`Volunteer: ${getStr(entry, "organization").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div className={`${compact ? "mb-2" : "mb-3"} relative ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1" : ""} ${moveFrom ? "opacity-60 bg-amber-50/50 rounded p-1" : ""} ${moveTo ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1" : ""}`}>
                      {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                      {moveFrom && <span className="absolute -top-2.5 left-3 text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moving</span>}
                      {moveTo && <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moved here</span>}
                      <p className="text-sm">
                        <span className="text-gray-700">
                          {renderField(`volunteer[${i}].position`, getStr(entry, "position"))}
                        </span>
                        {getStr(entry, "position") &&
                        getStr(entry, "organization")
                          ? sepP()
                          : null}
                        <span className="font-semibold">
                          {renderField(`volunteer[${i}].organization`, getStr(entry, "organization"))}
                        </span>
                      </p>
                      <p className="text-gray-500 text-sm mt-0.5">
                        {renderField(`volunteer[${i}].startDate`, getStr(entry, "startDate"))}
                        {getStr(entry, "startDate") ? " – " : ""}
                        {getStr(entry, "endDate")
                          ? renderField(`volunteer[${i}].endDate`, getStr(entry, "endDate"))
                          : (getStr(entry, "startDate") ? "Present" : "")}
                      </p>
                      {getStr(entry, "summary") && (
                        <p className="text-sm text-gray-700 mt-0.5">
                          {renderField(`volunteer[${i}].summary`, getStr(entry, "summary"))}
                        </p>
                      )}
                      {renderHighlightBulletList(
                        "volunteer",
                        i,
                        highlights,
                        "Volunteer Highlight",
                        subAddPatches,
                      )}
                    </div>
                  </SectionWrapper>
                  );
                })}
                {getAddPatchesForArray("volunteer", proposedPatches).map(
                  (patch, k) => {
                    const v = patch.value as Record<string, unknown>;
                    return (
                      <div key={`add-vol-${k}`} className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2">
                        <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">New</span>
                        <p className="text-sm mt-1">
                          <span className="text-gray-700">{(v?.position as string) ?? ""}</span>
                          {v?.position && v?.organization ? <span className="text-gray-400 mx-1">|</span> : null}
                          <span className="font-semibold">{(v?.organization as string) ?? ""}</span>
                        </p>
                      </div>
                    );
                  },
                )}
              </section>
            )}
            {(education.length > 0 ||
              getAddPatchesForArray("education", proposedPatches).length >
                0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Education</h2>
                {displaySectionList("education", education).map((entry, i) => {
                  const removePatch = getRemovePatchForPath(`education[${i}]`, proposedPatches);
                  const moveFrom = getMovePatchFrom(`education[${i}]`, proposedPatches);
                  const moveTo = getMovePatchTo(`education[${i}]`, proposedPatches);
                  const courses = getArr<string>(entry, "courses").filter(Boolean);
                  const subAddCourses = getAddPatchesForSubArray(`education.${i}.courses`, proposedPatches);
                  return (
                  <SectionWrapper
                    key={i}
                    path={`education[${i}]`}
                    label={`Education: ${getStr(entry, "institution").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div key={i} className={`${compact ? "mb-2" : "mb-3"} relative ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1" : ""} ${moveFrom ? "opacity-60 bg-amber-50/50 rounded p-1" : ""} ${moveTo ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1" : ""}`}>
                      {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                      {moveFrom && <span className="absolute -top-2.5 left-3 text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moving</span>}
                      {moveTo && <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moved here</span>}
                      <p className="font-semibold text-sm">
                        {renderField(`education[${i}].institution`, getStr(entry, "institution"))}
                      </p>
                      <p className="text-gray-600 text-sm mt-0.5">
                        {renderField(`education[${i}].studyType`, getStr(entry, "studyType"))}
                        {getStr(entry, "studyType") && getStr(entry, "area")
                          ? ", "
                          : null}
                        {renderField(`education[${i}].area`, getStr(entry, "area"))}
                        {(getStr(entry, "area") ||
                          getStr(entry, "studyType")) &&
                        (getStr(entry, "startDate") || getStr(entry, "endDate"))
                          ? " · "
                          : null}
                        {renderField(`education[${i}].startDate`, getStr(entry, "startDate"))}
                        {getStr(entry, "startDate") ? " – " : ""}
                        {getStr(entry, "endDate")
                          ? renderField(`education[${i}].endDate`, getStr(entry, "endDate"))
                          : (getStr(entry, "startDate") ? "Present" : "")}
                        {getStr(entry, "score")
                          ? <>{" · GPA: "}{renderField(`education[${i}].score`, getStr(entry, "score"))}</>
                          : null}
                      </p>
                      {(courses.length > 0 || subAddCourses.length > 0) && (
                        <p className="text-gray-500 text-sm mt-0.5">
                          Courses:{" "}
                          {courses.map((c, j) => (
                            <span key={j}>{j > 0 ? ", " : ""}{renderField(`education[${i}].courses[${j}]`, c)}</span>
                          ))}
                          {subAddCourses.map((p, k) => (
                            <span key={`add-${k}`} className="text-emerald-700">{courses.length > 0 || k > 0 ? ", " : ""}{typeof p.value === "string" ? p.value : ""}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  </SectionWrapper>
                  );
                })}
                {getAddPatchesForArray("education", proposedPatches).map(
                  (patch, k) => {
                    const v = patch.value as Record<string, unknown>;
                    return (
                      <div
                        key={`add-edu-${k}`}
                        className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2"
                      >
                        <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          New
                        </span>
                        <p className="font-semibold text-sm mt-1">
                          {(v?.institution as string) ?? ""}
                        </p>
                        <p className="text-gray-600 text-sm">
                          {(v?.studyType as string) ?? ""}
                          {v?.studyType && v?.area ? ", " : ""}
                          {(v?.area as string) ?? ""}
                        </p>
                      </div>
                    );
                  },
                )}
              </section>
            )}
            {(projects.length > 0 ||
              getAddPatchesForArray("projects", proposedPatches).length >
                0) && (
              <section className="resume-section">
                <h2 className={sectionHeading}>Projects</h2>
                {displaySectionList("projects", projects).map((entry, i) => {
                  const removePatch = getRemovePatchForPath(`projects[${i}]`, proposedPatches);
                  const moveFrom = getMovePatchFrom(`projects[${i}]`, proposedPatches);
                  const moveTo = getMovePatchTo(`projects[${i}]`, proposedPatches);
                  const highlights = getArr<string>(entry, "highlights").filter(Boolean);
                  const subAddPatches = getAddPatchesForSubArray(`projects.${i}.highlights`, proposedPatches);
                  return (
                  <SectionWrapper
                    key={i}
                    path={`projects[${i}]`}
                    label={`Project: ${getStr(entry, "name").slice(0, 10)}...`}
                    data={JSON.stringify(entry)}
                  >
                    <div key={i} className={`${compact ? "mb-2" : "mb-3"} relative ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1" : ""} ${moveFrom ? "opacity-60 bg-amber-50/50 rounded p-1" : ""} ${moveTo ? "ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded p-1" : ""}`}>
                      {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                      {moveFrom && <span className="absolute -top-2.5 left-3 text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moving</span>}
                      {moveTo && <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Moved here</span>}
                      <p className="font-semibold text-sm">
                        {renderField(`projects[${i}].name`, getStr(entry, "name"))}
                        {getStr(entry, "url") && (
                          <span className="font-normal text-gray-500">
                            {" — "}
                            {renderField(`projects[${i}].url`, getStr(entry, "url").replace(/^https?:\/\//, ""))}
                          </span>
                        )}
                      </p>
                      {getStr(entry, "description") && (
                        <p className="text-gray-600 text-sm mt-0.5">
                          {renderField(`projects[${i}].description`, getStr(entry, "description"))}
                        </p>
                      )}
                      {renderHighlightBulletList(
                        "projects",
                        i,
                        highlights,
                        "Project Highlight",
                        subAddPatches,
                      )}
                    </div>
                  </SectionWrapper>
                  );
                })}
                {getAddPatchesForArray("projects", proposedPatches).map(
                  (patch, k) => {
                    const v = patch.value as Record<string, unknown>;
                    const hl = Array.isArray(v?.highlights)
                      ? (v.highlights as string[])
                      : [];
                    return (
                      <div
                        key={`add-proj-${k}`}
                        className="mb-3 relative ring-2 ring-emerald-400/80 bg-emerald-50/30 rounded-xl p-2"
                      >
                        <span className="absolute -top-2.5 left-3 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          New
                        </span>
                        <p className="font-semibold text-sm mt-1">
                          {(v?.name as string) ?? ""}
                        </p>
                        {hl.length > 0 && (
                          <ul className="list-disc list-inside text-sm text-emerald-900 mt-0.5 ml-2">
                            {hl.map((h, j) => (
                              <li key={j}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  },
                )}
              </section>
            )}
            {(skills.length > 0 ||
              getAddPatchesForArray("skills", proposedPatches).length > 0) && (
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

                  const removePatch = getRemovePatchForPath(`skills[${i}]`, proposedPatches);
                  if (compact) {
                    return (
                      <SectionWrapper
                        key={i}
                        path={`skills[${i}]`}
                        label={`Skill: ${getStr(entry, "name").slice(0, 10)}...`}
                        data={JSON.stringify(entry)}
                      >
                        <div className={`mb-1.5 text-sm ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1 relative" : ""}`}>
                          {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                          <span className="font-semibold">
                            {renderField(`skills[${i}].name`, getStr(entry, "name"))}
                          </span>
                          {getStr(entry, "name") && kwStr ? ": " : null}
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
                      <div className={`mb-3 ${removePatch ? "line-through opacity-60 bg-rose-50/50 rounded p-1 relative" : ""}`}>
                        {removePatch && <span className="absolute -top-2.5 left-3 text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Removing</span>}
                        <p className="font-semibold text-sm">
                          {renderField(`skills[${i}].name`, getStr(entry, "name"))}
                        </p>
                        <p className="text-gray-700 text-sm mt-0.5">
                          {proposedKeywords != null ? (
                            <DiffView original={kwStr} proposed={proposedKeywords} />
                          ) : (kwStr || "\u00A0")}
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
                      {renderField(`languages[${i}].language`, getStr(entry, "language"))} —{" "}
                      {renderField(`languages[${i}].fluency`, getStr(entry, "fluency"))}
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
                      <span className="font-semibold">
                        {renderField(`certificates[${i}].name`, getStr(entry, "name"))}
                      </span>
                      {getStr(entry, "name") && getStr(entry, "issuer")
                        ? " – "
                        : null}
                      {renderField(`certificates[${i}].issuer`, getStr(entry, "issuer"))}
                      {getStr(entry, "issuer") && getStr(entry, "date")
                        ? ", "
                        : null}
                      {renderField(`certificates[${i}].date`, getStr(entry, "date"))}
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
                      <span className="font-semibold">
                        {renderField(`awards[${i}].title`, getStr(entry, "title"))}
                      </span>
                      {getStr(entry, "title") && getStr(entry, "awarder")
                        ? " – "
                        : null}
                      {renderField(`awards[${i}].awarder`, getStr(entry, "awarder"))}
                      {getStr(entry, "awarder") && getStr(entry, "date")
                        ? ", "
                        : null}
                      {renderField(`awards[${i}].date`, getStr(entry, "date"))}
                      {getStr(entry, "summary") ? (
                        <p className="text-gray-700 mt-0.5">
                          {renderField(`awards[${i}].summary`, getStr(entry, "summary"))}
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
                      <span className="font-semibold">
                        {renderField(`publications[${i}].name`, getStr(entry, "name"))}
                      </span>
                      {getStr(entry, "name") && getStr(entry, "publisher")
                        ? " – "
                        : null}
                      {renderField(`publications[${i}].publisher`, getStr(entry, "publisher"))}
                      {getStr(entry, "publisher") &&
                      getStr(entry, "releaseDate")
                        ? ", "
                        : null}
                      {renderField(`publications[${i}].releaseDate`, getStr(entry, "releaseDate"))}
                      {getStr(entry, "summary") ? (
                        <p className="text-gray-700 mt-0.5">
                          {renderField(`publications[${i}].summary`, getStr(entry, "summary"))}
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
                        <span className="font-semibold">
                          {renderField(`interests[${i}].name`, getStr(entry, "name"))}
                        </span>
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
                        {renderField(`references[${i}].name`, getStr(entry, "name"))}
                      </p>
                      {getStr(entry, "reference") ? (
                        <p className="text-sm text-gray-700 mt-0.5">
                          {renderField(`references[${i}].reference`, getStr(entry, "reference"))}
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

  return <ResumeEditForm resume={resume} onChange={onChange} />;
}
