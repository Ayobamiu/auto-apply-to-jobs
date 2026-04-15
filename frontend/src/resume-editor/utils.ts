import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import get from "lodash/get";
import { applyPatch, getValueByPointer, type Operation } from "fast-json-patch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposedPatch {
  op: "replace" | "add" | "remove" | "move" | "copy";
  path: string; // JSON Pointer (RFC 6901), e.g. /work/0/highlights/0
  value: unknown;
  original: unknown; // snapshot of the current value before applying
  from?: string; // Source path for move/copy operations
  fromOriginal?: unknown; // snapshot of the value at "from" before applying
}

// ---------------------------------------------------------------------------
// Path conversions
// ---------------------------------------------------------------------------

/** /work/0/name → work.0.name */
export function jsonPointerToDot(pointer: string): string {
  return pointer.replace(/^\//, "").replace(/\//g, ".");
}

/** work[0].name → work.0.name */
export function normalizePath(path: string): string {
  return path.replace(/\[(\d+)\]/g, ".$1").replace(/^\.|\.$/g, "") || path;
}

// ---------------------------------------------------------------------------
// Matching a UI field path against the patches array
// ---------------------------------------------------------------------------

/**
 * Given a field path (bracket/dot notation used in JSX, e.g. `work[0].position`)
 * and the array of proposed patches, find the first patch that covers this field.
 *
 * Returns `{ proposed, original, isExact, patchIndex }` or `undefined`.
 *
 * - Exact match:  patch path === field path
 * - Parent match: patch path is a prefix  →  drills into patch.value
 */
export function getProposedValueForPath(
  fieldPath: string,
  patches: ProposedPatch[],
): { proposed: unknown; original: unknown; isExact: boolean; patchIndex: number } | undefined {
  if (!patches || patches.length === 0) return undefined;
  const normField = normalizePath(fieldPath);
  // Prefer longer (more specific) patch paths so e.g. /work/0/highlights wins over /work/0
  const sorted = [...patches.entries()].sort(
    (a, b) => jsonPointerToDot(b[1].path).length - jsonPointerToDot(a[1].path).length,
  );

  for (const [i, patch] of sorted) {
    const normPatch = jsonPointerToDot(patch.path);

    if (normPatch === normField) {
      return { proposed: patch.value, original: patch.original, isExact: true, patchIndex: i };
    }

    if (normField.startsWith(normPatch + ".")) {
      const subPath = normField.slice(normPatch.length + 1);
      const proposedVal = patch.value != null && typeof patch.value === "object" ? get(patch.value, subPath) : undefined;
      const originalVal = patch.original != null && typeof patch.original === "object" ? get(patch.original, subPath) : undefined;
      return { proposed: proposedVal, original: originalVal, isExact: false, patchIndex: i };
    }
  }
  return undefined;
}

/** True when any patch targets this exact section path. */
export function isPathUnderPatch(sectionPath: string, patches: ProposedPatch[]): boolean {
  const norm = normalizePath(sectionPath);
  return patches.some(p => jsonPointerToDot(p.path) === norm);
}

/** Returns 'add' patches that append items to a given array section (e.g. "work", "education"). */
export function getAddPatchesForArray(sectionPath: string, patches: ProposedPatch[]): ProposedPatch[] {
  const norm = normalizePath(sectionPath);
  return patches.filter(p => {
    if (p.op !== "add") return false;
    const pNorm = jsonPointerToDot(p.path);
    const parts = pNorm.split(".");
    const parentParts = norm.split(".");
    if (parts.length !== parentParts.length + 1) return false;
    return parts.slice(0, -1).join(".") === norm && /^\d+$/.test(parts[parts.length - 1]);
  });
}

// ---------------------------------------------------------------------------
// Human-readable label from a JSON Pointer
// ---------------------------------------------------------------------------

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
// Resume get / set (used by manual edits)
// ---------------------------------------------------------------------------

export function getResumePath(resume: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = resume;
  for (const key of parts) {
    if (current == null || typeof current !== "object") return undefined;
    const num = Number(key);
    const k = Number.isNaN(num) ? key : num;
    current = (current as Record<string, unknown>)[k as string];
  }
  return current;
}

export const setResumePath = (resume: any, path: string, value: any) => {
  const newResume = cloneDeep(resume);
  set(newResume, path, value);
  return newResume;
};

// ---------------------------------------------------------------------------
// Sub-array add patches (e.g., /work/0/highlights/3)
// ---------------------------------------------------------------------------

/** Returns 'add' patches that append items to a nested array (e.g. "work.0.highlights"). */
export function getAddPatchesForSubArray(parentPath: string, patches: ProposedPatch[]): ProposedPatch[] {
  const norm = normalizePath(parentPath);
  return patches.filter(p => {
    if (p.op !== "add") return false;
    const pNorm = jsonPointerToDot(p.path);
    const parts = pNorm.split(".");
    const parentParts = norm.split(".");
    if (parts.length !== parentParts.length + 1) return false;
    const last = parts[parts.length - 1];
    return parts.slice(0, -1).join(".") === norm && (/^\d+$/.test(last) || last === "-");
  });
}

/** JSON Pointer append segment "-" → concrete index for validation (RFC 6902). */
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

const ARRAY_COLLAPSE_ROOTS = ["work", "education", "volunteer", "projects"] as const;

function normPtr(s: string | undefined): string {
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
}

function patchTouchesArrayRoot(p: ProposedPatch, root: string): boolean {
  const prefix = `/${root}`;
  const path = normPtr(p.path);
  const from = normPtr(p.from);
  if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  if (from && (from === prefix || from.startsWith(`${prefix}/`))) return true;
  return false;
}

/**
 * When the model emits multiple move ops on the same array (e.g. /work), indices are
 * interpreted against the document after each move — stale indices rotate the wrong items.
 * Simulate the full patch list and replace all patches touching that root with one replace.
 */
export function collapseArrayMovesToSingleReplace(
  resume: Record<string, unknown>,
  patches: ProposedPatch[],
): ProposedPatch[] {
  let out = patches;
  for (const root of ARRAY_COLLAPSE_ROOTS) {
    const hasMove = out.some(
      p => p.op === "move" && p.from && patchTouchesArrayRoot(p, root),
    );
    if (!hasMove) continue;
    const touches = out.some(p => patchTouchesArrayRoot(p, root));
    if (!touches) continue;

    const clone = cloneDeep(resume) as Record<string, unknown>;
    const ops = out.map(p => {
      const o: Record<string, unknown> = { op: p.op, path: p.path };
      if (p.value !== undefined) o.value = p.value;
      if (p.from) o.from = p.from;
      return o;
    });
    try {
      applyPatch(clone, ops as unknown as Operation[]);
    } catch {
      continue;
    }
    const newVal = clone[root];
    const oldVal = resume[root];
    const kept = out.filter(p => !patchTouchesArrayRoot(p, root));
    out = [
      ...kept,
      {
        op: "replace",
        path: `/${root}`,
        value: newVal,
        original: oldVal,
      },
    ];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Remove patch detection
// ---------------------------------------------------------------------------

/** Returns remove patches that target a specific path or items under it. */
export function getRemovePatchForPath(path: string, patches: ProposedPatch[]): ProposedPatch | undefined {
  const norm = normalizePath(path);
  return patches.find(p => p.op === "remove" && jsonPointerToDot(p.path) === norm);
}

// ---------------------------------------------------------------------------
// Move patch detection
// ---------------------------------------------------------------------------

/** Returns move patches where the given path is the source ("from"). */
export function getMovePatchFrom(path: string, patches: ProposedPatch[]): ProposedPatch | undefined {
  const norm = normalizePath(path);
  return patches.find(p => p.op === "move" && p.from && jsonPointerToDot(p.from) === norm);
}

/** Returns move patches where the given path is the destination ("path"). */
export function getMovePatchTo(path: string, patches: ProposedPatch[]): ProposedPatch | undefined {
  const norm = normalizePath(path);
  return patches.find(p => p.op === "move" && jsonPointerToDot(p.path) === norm);
}
