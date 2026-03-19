/**
 * Simple analytics hooks for dynamic form extraction.
 * Logs metrics to console (structured JSON) for observability.
 * Can be extended to write to DB or external service.
 */

export interface FormExtractionMetrics {
  userId: string;
  jobRef: string;
  site: string;
  totalFields: number;
  dynamicFields: number;
  fileUploadFields: number;
  classifiedWithRules: number;
  classifiedWithLLM: number;
  classifiedAsUnknown: number;
  answersFromProfile: number;
  answersFromSaved: number;
  answersFromAI: number;
  answersBlank: number;
  hasWrittenDocument: boolean;
  extractionDurationMs?: number;
}

export interface FormFillMetrics {
  userId: string;
  jobRef: string;
  site: string;
  totalFilled: number;
  fillSuccessCount: number;
  fillFailureCount: number;
  fillDurationMs?: number;
}

export interface FormReviewMetrics {
  userId: string;
  jobRef: string;
  fieldsEdited: number;
  fieldsAccepted: number;
  totalFields: number;
}

export function logExtractionMetrics(m: FormExtractionMetrics): void {
  console.log(`[analytics:form-extraction] ${JSON.stringify(m)}`);
}

export function logFillMetrics(m: FormFillMetrics): void {
  console.log(`[analytics:form-fill] ${JSON.stringify(m)}`);
}

export function logReviewMetrics(m: FormReviewMetrics): void {
  console.log(`[analytics:form-review] ${JSON.stringify(m)}`);
}

/**
 * Compute extraction metrics from classified fields and answers.
 */
export function computeExtractionMetrics(
  userId: string,
  jobRef: string,
  site: string,
  classifiedFields: Array<{ fieldType: string; intent: string; confidence: number }>,
  answers: Array<{ source: string; value: string | string[] }>,
  hasWrittenDocument: boolean,
  durationMs?: number,
): FormExtractionMetrics {
  const totalFields = classifiedFields.length;
  const dynamicFields = classifiedFields.filter((f) => f.fieldType !== 'file_upload').length;
  const fileUploadFields = totalFields - dynamicFields;

  const classifiedWithRules = classifiedFields.filter(
    (f) => f.intent !== 'unknown' && f.confidence >= 0.7,
  ).length;
  const classifiedAsUnknown = classifiedFields.filter((f) => f.intent === 'unknown').length;
  const classifiedWithLLM = totalFields - classifiedWithRules - classifiedAsUnknown;

  const answersFromProfile = answers.filter((a) => a.source === 'profile').length;
  const answersFromSaved = answers.filter((a) => a.source === 'saved_answer').length;
  const answersFromAI = answers.filter((a) => a.source === 'ai_generated').length;
  const answersBlank = answers.filter(
    (a) => !a.value || (Array.isArray(a.value) && a.value.length === 0),
  ).length;

  return {
    userId,
    jobRef,
    site,
    totalFields,
    dynamicFields,
    fileUploadFields,
    classifiedWithRules,
    classifiedWithLLM,
    classifiedAsUnknown,
    answersFromProfile,
    answersFromSaved,
    answersFromAI,
    answersBlank,
    hasWrittenDocument,
    extractionDurationMs: durationMs,
  };
}
