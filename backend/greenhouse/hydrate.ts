/**
 * Greenhouse job hydration: fetches full job content + form questions from the
 * Greenhouse boards API, updates DB with description, and pre-extracts form fields
 * so they're ready before the user clicks Apply.
 */
import { pool } from '../api/db.js';
import { updateJob, getJob } from '../data/jobs.js';
import type { GreenhouseJob } from '../types/jobs.js';
import type { NormalizedFormField, } from '../shared/types.js';

interface GreenhouseQuestionField {
  name: string;
  type: string;
  values?: { value: number | string; label: string }[];
}

interface GreenhouseQuestion {
  required: boolean;
  label: string;
  fields: GreenhouseQuestionField[];
}

interface GreenhouseDemographicOption {
  id: number;
  label: string;
  free_form: boolean;
}

interface GreenhouseDemographicQuestion {
  id: number;
  label: string;
  required: boolean;
  type: string;
  answer_options: GreenhouseDemographicOption[];
}

interface GreenhouseJobFull extends GreenhouseJob {
  content?: string;
  questions?: GreenhouseQuestion[];
  location_questions?: GreenhouseQuestion[];
  compliance?: GreenhouseQuestion[];
  demographic_questions?: {
    header: string;
    description: string;
    questions: GreenhouseDemographicQuestion[];
  };
}

export interface HydrateResult {
  description: string | null;
  content: string | null;
  alreadyHydrated: boolean;
  formFields: NormalizedFormField[];
}

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ghFieldTypeToNormalized(ghType: string): NormalizedFormField['fieldType'] {
  switch (ghType) {
    case 'input_file': return 'file_upload';
    case 'input_text': return 'text';
    case 'input_hidden': return 'text';
    case 'textarea': return 'textarea';
    case 'multi_value_single_select': return 'select';
    case 'multi_value_multi_select': return 'checkbox';
    default: return 'text';
  }
}

function convertQuestionsToFields(
  questions: GreenhouseQuestion[],
  startIndex: number,
): NormalizedFormField[] {
  const fields: NormalizedFormField[] = [];
  let idx = startIndex;

  for (const q of questions) {
    for (const f of q.fields) {
      if (f.type === 'input_hidden') continue;

      const fieldType = ghFieldTypeToNormalized(f.type);
      const options = f.values?.map((v) => ({
        value: String(v.value),
        label: v.label,
      })) ?? [];

      fields.push({
        id: f.name || `gh_field_${idx}`,
        rawLabel: q.label,
        fieldType,
        required: q.required,
        options,
        selectors: {
          inputSelector: `[name="${f.name}"]`,
        },
      });
      idx++;
    }
  }

  return fields;
}

function convertDemographicQuestions(
  demo: GreenhouseJobFull['demographic_questions'],
  startIndex: number,
): NormalizedFormField[] {
  if (!demo?.questions) return [];
  const fields: NormalizedFormField[] = [];
  let idx = startIndex;

  for (const q of demo.questions) {
    const fieldType = q.type === 'multi_value_multi_select' ? 'checkbox' : 'select';
    const options = q.answer_options.map((o) => ({
      value: String(o.id),
      label: o.label,
    }));

    fields.push({
      id: `demographic_${q.id}`,
      rawLabel: q.label,
      fieldType,
      required: q.required,
      options,
      selectors: {
        inputSelector: `[data-demographic-question-id="${q.id}"]`,
      },
    });
    idx++;
  }

  return fields;
}

export async function getGreenhouseSlugForJob(jobId: string): Promise<string | null> {
  try {
    const res = await pool.query<{ greenhouse_slug: string }>(
      `SELECT greenhouse_slug FROM jobs WHERE site = 'greenhouse' AND job_id = $1`,
      [jobId],
    );
    return res.rows[0]?.greenhouse_slug ?? null;
  } catch {
    return null;
  }
}

export async function hydrateGreenhouseJob(jobId: string, slug?: string): Promise<HydrateResult> {
  const existing = await getJob('greenhouse', jobId);
  if (existing?.description && existing.description.length > 100) {
    return { description: existing.description, content: null, alreadyHydrated: true, formFields: [] };
  }

  const resolvedSlug = slug ?? await getGreenhouseSlugForJob(jobId);
  if (!resolvedSlug) {
    return { description: null, content: null, alreadyHydrated: false, formFields: [] };
  }

  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${resolvedSlug}/jobs/${jobId}?questions=true`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      console.warn(`[hydrate] Greenhouse API returned ${res.status} for ${resolvedSlug}/${jobId}`);
      return { description: null, content: null, alreadyHydrated: false, formFields: [] };
    }

    const data: GreenhouseJobFull = await res.json();
    const htmlContent = data.content ?? '';
    const plainDescription = stripHtml(htmlContent);

    await updateJob('greenhouse', jobId, {
      description: plainDescription,
      title: data.title ?? undefined,
      url: data.absolute_url ?? undefined,
      location: data.location?.name ?? undefined,
    });

    let formFields: NormalizedFormField[] = [];
    let idx = 0;

    if (data.location_questions) {
      const locFields = convertQuestionsToFields(data.location_questions, idx);
      formFields.push(...locFields);
      idx += locFields.length;
    }

    if (data.questions) {
      const qFields = convertQuestionsToFields(data.questions, idx);
      formFields.push(...qFields);
      idx += qFields.length;
    }

    if (data.compliance) {
      const compFields = convertQuestionsToFields(data.compliance, idx);
      formFields.push(...compFields);
      idx += compFields.length;
    }

    if (data.demographic_questions) {
      const demoFields = convertDemographicQuestions(data.demographic_questions, idx);
      formFields.push(...demoFields);
    }

    return { description: plainDescription, content: htmlContent, alreadyHydrated: false, formFields };
  } catch (err) {
    console.warn('[hydrate] Failed to fetch greenhouse job:', (err as Error).message);
    return { description: null, content: null, alreadyHydrated: false, formFields: [] };
  }
}
