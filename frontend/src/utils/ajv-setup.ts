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
export function validateResumeFragment<T>(path: string, proposedData: T) {
    const normalized = normalizeProposedDates(proposedData);
    const segments = path.split(/[\[\]\.]/).filter(Boolean);
    const rootSection = segments[0];

    let currentSchemaPath = `${SCHEMA_KEY}#/properties/${rootSection}`;

    for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        const currentSchema = ajv.getSchema(currentSchemaPath)?.schema as any;

        // If the current level is an array, the next part of the path 
        // is either an index or a property of the items.
        if (currentSchema?.type === 'array') {
            currentSchemaPath += "/items";

            // If the segment is NOT a number, it's a property inside the item
            // (e.g., work[0].company -> segment is 'company')
            if (isNaN(Number(segment))) {
                currentSchemaPath += `/properties/${segment}`;
            }
            // If it IS a number (e.g., work[0]), we just stay at /items 
            // to validate the object itself.
        } else if (currentSchema?.properties && currentSchema.properties[segment]) {
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