import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import get from "lodash/get";

/**
 * Normalize JSON path to dot notation for comparison (e.g. "work[1]" → "work.1").
 */
export function normalizePath(path: string): string {
  return path.replace(/\[(\d+)\]/g, ".$1").replace(/^\.|\.$/g, "") || path;
}

/**
 * True if normalizedPrefix is a prefix of normalizedFull (exact or parent).
 * e.g. isPathPrefix("work.1", "work.1.position") → true
 */
export function isPathPrefix(prefix: string, fullPath: string): boolean {
  const n = normalizePath(prefix);
  const f = normalizePath(fullPath);
  return n === f || f.startsWith(n + ".");
}

/**
 * If fullPath is under parentPath, return the relative subpath; else null.
 * e.g. getSubPath("work.1", "work.1.position") → "position"
 *      getSubPath("work[1]", "work.1.highlights.0") → "highlights.0"
 */
export function getSubPath(parentPath: string, fullPath: string): string | null {
  const p = normalizePath(parentPath);
  const f = normalizePath(fullPath);
  if (p === f) return "";
  if (f.startsWith(p + ".")) return f.slice(p.length + 1);
  return null;
}

/**
 * Human-readable label for the ReviewBar from a proposedChange path (e.g. "work[1]" → "Experience", "basics.summary" → "Summary").
 */
export function pathToReviewLabel(path: string): string {
  const n = normalizePath(path);
  const [section, ...rest] = n.split(".");
  const sectionLabels: Record<string, string> = {
    basics: "Basics",
    work: "Experience",
    volunteer: "Volunteer",
    education: "Education",
    skills: "Skills",
    projects: "Projects",
    languages: "Languages",
    certificates: "Certificates",
    awards: "Awards",
    publications: "Publications",
    interests: "Interests",
    references: "References",
  };
  const base = sectionLabels[section] ?? section;
  if (rest.length === 0) return base;
  if (rest[0] && /^\d+$/.test(rest[0]) && rest.length === 1) return `${base} item`;
  if (rest.includes("highlights")) return `${base} highlight`;
  if (rest.includes("position") || rest.includes("name")) return base;
  return base;
}

/**
 * Get the proposed value for a field path when proposedChange is a block-level (parent) or exact match.
 * Returns { proposed, isExact } or undefined when no match.
 */
export function getProposedValueForPath(
  fieldPath: string,
  proposedChange: { path: string; original: unknown; proposed: unknown } | null
): { proposed: unknown; isExact: boolean } | undefined {
  if (!proposedChange) return undefined;
  const normField = normalizePath(fieldPath);
  const normProposedPath = normalizePath(proposedChange.path);
  if (normProposedPath === normField) {
    return { proposed: proposedChange.proposed, isExact: true };
  }
  const subPath = getSubPath(proposedChange.path, fieldPath);
  if (subPath === null) return undefined;
  const proposedVal = get(proposedChange.proposed, subPath);
  return { proposed: proposedVal, isExact: false };
}

/**
 * Get a value from resume by dot path (e.g. "basics.name", "work.0.position").
 */
export function getResumePath(
  resume: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = resume;
  for (const key of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    const num = Number(key);
    const k = Number.isNaN(num) ? key : num;
    current = (current as Record<string, unknown>)[k as string];
  }
  return current;
}

/**
 * Return a new resume object with the value at path set. Path uses dot notation
 * (e.g. "basics.name", "work.2.highlights.0"). Creates intermediate objects/arrays as needed.
 */

export const setResumePath = (resume: any, path: string, value: any) => {
  // 1. Deep clone to ensure React detects a state change
  const newResume = cloneDeep(resume);

  // 2. lodash.set handles "work[0]" by updating the array at index 0
  // instead of creating a new key called "work[0]"
  set(newResume, path, value);

  return newResume;
};