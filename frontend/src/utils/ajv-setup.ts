import Ajv from "ajv";
import addFormats from "ajv-formats";
import cloneDeep from "lodash/cloneDeep";
import schema from "../hooks/resume-schema.json"; // Your uploaded schema

const DATE_FIELDS = new Set(["startDate", "endDate", "date"]);
const PRESENT_ALIASES = /^(present|current|now|ongoing)$/i;

/** Today in ISO-8601 (YYYY-MM) for schema compliance when AI returns "Present". */
function todayIso8601(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Recursively normalize date fields: replace "Present" (and common variants) with current date in ISO-8601.
 * Handles AI hallucinations so validation passes before the UI shows the diff.
 */
export function normalizeProposedDates<T>(data: T): T {
  const out = cloneDeep(data) as Record<string, unknown>;
  function walk(obj: Record<string, unknown>) {
    if (obj == null || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (DATE_FIELDS.has(key) && typeof v === "string" && PRESENT_ALIASES.test(v.trim())) {
        (obj as Record<string, unknown>)[key] = todayIso8601();
      }
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>);
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item != null && typeof item === "object") walk(item as Record<string, unknown>);
        }
      }
    }
  }
  walk(out);
  return out as T;
}

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false
});
addFormats(ajv);

// 1. Give the schema a clear ID so AJV can resolve internal $refs
const SCHEMA_KEY = "resume-schema.json";
if (!ajv.getSchema(SCHEMA_KEY)) {
  ajv.addSchema(schema, SCHEMA_KEY);
}
export function validateResumeFragment<T>(pointer: string, proposedData: T) {
  const normalized = normalizeProposedDates(proposedData);

  // 1. Convert JSON Pointer (/work/0/name) to JSON Schema Path (#/properties/work/items/properties/name)
  // We remove the leading slash and split
  const segments = pointer.split('/').filter(Boolean);

  let currentSchemaPath = `${SCHEMA_KEY}#`;

  for (const segment of segments) {
    const currentSchema = ajv.getSchema(currentSchemaPath)?.schema as any;

    if (currentSchema?.type === 'array') {
      // If the schema is an array, we move to /items
      currentSchemaPath += "/items";

      // If the segment is NOT a number (e.g. /work/name), we move into properties
      if (isNaN(Number(segment))) {
        currentSchemaPath += `/properties/${segment}`;
      }
      // If it IS a number (index), we stay at /items to validate the object
    } else {
      currentSchemaPath += `/properties/${segment}`;
    }
  }

  const validate = ajv.getSchema(currentSchemaPath);

  if (!validate) {
    return {
      isValid: false,
      errors: [`Path not found: ${currentSchemaPath}`],
      sanitizedData: proposedData
    };
  }

  const isValid = validate(normalized);
  return {
    isValid: !!isValid,
    errors: validate.errors?.map(err => `${err.instancePath} ${err.message}`) || [],
    sanitizedData: normalized
  };
}