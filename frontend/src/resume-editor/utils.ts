import { getValueByPointer } from "fast-json-patch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposedPatch {
  op: "replace" | "add" | "remove" | "move" | "copy";
  path: string;
  value: unknown;
  original: unknown;
  from?: string;
  fromOriginal?: unknown;
}

// ---------------------------------------------------------------------------
// Human-readable label from a JSON Pointer
// ---------------------------------------------------------------------------

function jsonPointerToDot(pointer: string): string {
  return pointer.replace(/^\//, "").replace(/\//g, ".");
}

const SECTION_LABELS: Record<string, string> = {
  basics: "Summary", work: "Experience", volunteer: "Volunteer",
  education: "Education", skills: "Skills", projects: "Projects",
  languages: "Languages", certificates: "Certificates", awards: "Awards",
  publications: "Publications", interests: "Interests", references: "References",
};

export function pathToReviewLabel(pointer: string): string {
  const n = jsonPointerToDot(pointer);
  const [section, ...rest] = n.split(".");
  const base = SECTION_LABELS[section] ?? section;
  if (rest.length === 0) return base;
  if (rest.length === 1 && /^\d+$/.test(rest[0])) return `${base} item`;
  if (rest.includes("highlights")) return `${base} bullet`;
  return base;
}

// ---------------------------------------------------------------------------
// JSON Pointer append segment resolution (used by useAiEditor for AJV)
// ---------------------------------------------------------------------------

export function resolvePointerAppendSegment(
  resume: Record<string, unknown>,
  pointer: string,
): string {
  if (!pointer.endsWith("/-")) return pointer;
  const parent = pointer.slice(0, -2);
  if (!parent) return pointer;
  try {
    const arr = getValueByPointer(resume, parent);
    const len = Array.isArray(arr) ? arr.length : 0;
    return `${parent}/${len}`;
  } catch {
    return `${parent}/0`;
  }
}
