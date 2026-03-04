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
export function setResumePath(
  resume: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 0) return { ...resume };

  function setAt(
    obj: Record<string, unknown> | unknown[],
    keys: string[],
    val: unknown
  ): Record<string, unknown> | unknown[] {
    const [head, ...rest] = keys;
    const num = Number(head);
    const isArray = Array.isArray(obj);
    const index = !Number.isNaN(num) ? num : head;

    if (rest.length === 0) {
      const out = isArray ? [...(obj as unknown[])] : { ...obj };
      (out as Record<string, unknown>)[index as string] = val;
      return out as Record<string, unknown>;
    }

    const next = (isArray ? (obj as unknown[])[index as number] : obj[index as string]) as Record<string, unknown> | undefined;
    const nextIsArray = Array.isArray(next);
    const nextObj = next != null && typeof next === 'object'
      ? (nextIsArray ? [...(next as unknown[])] : { ...next })
      : (typeof rest[0] === 'string' && /^\d+$/.test(rest[0]) ? [] : {}) as Record<string, unknown>;
    const updated = setAt(nextObj, rest, val);
    const out = isArray ? [...(obj as unknown[])] : { ...obj };
    (out as Record<string, unknown>)[index as string] = updated;
    return out as Record<string, unknown>;
  }

  return setAt({ ...resume }, parts, value) as Record<string, unknown>;
}
