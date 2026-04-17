/**
 * Collapse duplicate rows in JSON Resume list sections (LLM or merge glitches).
 * One place to maintain fingerprints for work, education, projects, etc.
 */
function fp(...parts: unknown[]): string {
  return parts.map((p) => String(p ?? '').trim().toLowerCase()).join('\x1f');
}

function asObjectArray(arr: unknown): Record<string, unknown>[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item));
}

function dedupeByFingerprint(rows: Record<string, unknown>[], keyFn: (o: Record<string, unknown>) => string): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const o of rows) {
    const k = keyFn(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/** Merge rows that share the same normalized `name`; union keywords; keep first row's display name. */
function dedupeMergeByNameField(
  rows: Record<string, unknown>[],
  nameField: 'name',
  keywordsField: 'keywords',
  extraMerge?: (prev: Record<string, unknown>, next: Record<string, unknown>) => void,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const o of rows) {
    const key = fp(o[nameField]);
    const kwRaw = o[keywordsField];
    const kw = Array.isArray(kwRaw) ? kwRaw.filter((x): x is string => typeof x === 'string') : [];
    if (!map.has(key)) {
      map.set(key, { ...o, [keywordsField]: [...new Set(kw)] });
    } else {
      const prev = map.get(key)!;
      const prevKw = Array.isArray(prev[keywordsField])
        ? (prev[keywordsField] as string[]).filter((x) => typeof x === 'string')
        : [];
      prev[keywordsField] = [...new Set([...prevKw, ...kw])];
      extraMerge?.(prev, o);
    }
  }
  return [...map.values()];
}

/**
 * Mutates `resume` in place. Call after parsing LLM output / before persisting.
 * Accepts any JSON-Resume-shaped object (schema includes fields not on our Resume interface, e.g. certificates).
 */
export function dedupeResumeListRows(resume: object): void {
  const r = resume as Record<string, unknown>;

  if (Array.isArray(r.education)) {
    r.education = dedupeByFingerprint(asObjectArray(r.education), (e) =>
      fp(e.institution, e.area, e.studyType, e.startDate, e.endDate, e.score),
    );
  }

  if (Array.isArray(r.work)) {
    r.work = dedupeByFingerprint(asObjectArray(r.work), (w) =>
      fp(w.name, w.position, w.startDate, w.endDate, w.location),
    );
  }

  if (Array.isArray(r.volunteer)) {
    r.volunteer = dedupeByFingerprint(asObjectArray(r.volunteer), (v) =>
      fp(v.organization, v.position, v.startDate, v.endDate),
    );
  }

  if (Array.isArray(r.projects)) {
    r.projects = dedupeByFingerprint(asObjectArray(r.projects), (p) =>
      fp(p.name, p.entity, p.startDate, p.endDate, p.url),
    );
  }

  if (Array.isArray(r.awards)) {
    r.awards = dedupeByFingerprint(asObjectArray(r.awards), (a) => fp(a.title, a.date, a.awarder));
  }

  if (Array.isArray(r.certificates)) {
    r.certificates = dedupeByFingerprint(asObjectArray(r.certificates), (c) =>
      fp(c.name, c.issuer, c.date),
    );
  }

  if (Array.isArray(r.publications)) {
    r.publications = dedupeByFingerprint(asObjectArray(r.publications), (p) =>
      fp(p.name, p.publisher, p.releaseDate),
    );
  }

  if (Array.isArray(r.languages)) {
    r.languages = dedupeByFingerprint(asObjectArray(r.languages), (l) => fp(l.language, l.fluency));
  }

  if (Array.isArray(r.references)) {
    r.references = dedupeByFingerprint(asObjectArray(r.references), (ref) => fp(ref.name));
  }

  if (Array.isArray(r.interests)) {
    r.interests = dedupeMergeByNameField(asObjectArray(r.interests), 'name', 'keywords');
  }

  if (Array.isArray(r.skills)) {
    r.skills = dedupeMergeByNameField(asObjectArray(r.skills), 'name', 'keywords', (prev, next) => {
      if (!String(prev.level ?? '').trim() && String(next.level ?? '').trim()) prev.level = next.level;
    });
  }

  const basics = r.basics;
  if (basics && typeof basics === 'object' && !Array.isArray(basics)) {
    const b = basics as Record<string, unknown>;
    if (Array.isArray(b.profiles)) {
      b.profiles = dedupeByFingerprint(asObjectArray(b.profiles), (p) => fp(p.network, p.url, p.username));
    }
  }
}
