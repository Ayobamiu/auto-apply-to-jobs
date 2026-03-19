/**
 * Dynamic form extraction pipeline.
 * Orchestrates: extraction → classification → answer generation.
 */
export { extractHandshakeForm } from './handshake-extractor.js';
export { classifyField, classifyAllFields } from './field-classifier.js';
export { generateAnswers, questionHash } from './answer-generator.js';
export type { GenerateAnswersInput } from './answer-generator.js';
export { processDynamicForm } from './dynamic-form-processor.js';
export type { ProcessDynamicFormOptions, ProcessDynamicFormResult } from './dynamic-form-processor.js';
export { fillDynamicFields } from './handshake-form-filler.js';
export { getSiteAdapter, registerSiteAdapter, listRegisteredSites } from './site-adapter-registry.js';
export { logExtractionMetrics, logFillMetrics, logReviewMetrics, computeExtractionMetrics } from './analytics.js';
export type { FormExtractionMetrics, FormFillMetrics, FormReviewMetrics } from './analytics.js';
