/**
 * GET /users/me/resume, PUT /users/me/resume, POST /users/me/resume (auth required).
 * Base resume JSON: upload (text or PDF) or edit (GET/PUT).
 */
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getBaseResume, saveBaseResume } from '../../data/user-resumes.js';
import { extractResumeJsonFromText } from '../../shared/resume-json-from-text.js';
import { pdfBufferToText } from '../../shared/pdf-to-text.js';
import { updateProfile } from '../../data/profile.js';
import type { Profile } from '../../shared/types.js';

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function userResumeUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.is('multipart/form-data')) {
    upload.single('resume')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'File upload failed';
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
    return;
  }
  next();
}

function jsonResumeToProfile(json: Record<string, unknown>): Partial<Profile> {
  const basics = (json.basics as Record<string, unknown>) ?? {};
  const name = typeof basics.name === 'string' ? basics.name : '';
  const email = typeof basics.email === 'string' ? basics.email : '';
  const phone = typeof basics.phone === 'string' ? basics.phone : '';
  const summary = typeof basics.summary === 'string' ? basics.summary : '';
  const loc = basics.location;
  const location =
    typeof loc === 'string' ? loc : loc && typeof loc === 'object' && 'region' in loc ? String((loc as Record<string, unknown>).region ?? '') : '';
  const profiles = (basics.profiles as Array<{ network?: string; url?: string }>) ?? [];
  const linkedin = profiles.find((p) => p?.network?.toLowerCase() === 'linkedin')?.url ?? '';
  const work = (json.work as Array<Record<string, unknown>>) ?? [];
  const education = (json.education as Array<Record<string, unknown>>) ?? [];
  const experience = work.map((w) => ({
    title: typeof w.position === 'string' ? w.position : undefined,
    company: typeof w.name === 'string' ? w.name : undefined,
    location: typeof w.location === 'string' ? w.location : undefined,
    dates: [w.startDate, w.endDate].filter(Boolean).join(' – '),
    bullets: Array.isArray(w.highlights) ? (w.highlights as string[]) : undefined,
    startMonth: typeof w.startMonth === 'string' ? w.startMonth : undefined,
    startYear: typeof w.startYear === 'string' ? w.startYear : undefined,
    endMonth: typeof w.endMonth === 'string' ? w.endMonth : undefined,
    endYear: typeof w.endYear === 'string' ? w.endYear : undefined,
  }));
  const ed: Array<{ school?: string; degree?: string; year?: string; startMonth?: string; startYear?: string; endMonth?: string; endYear?: string }> = education.map((e) => {
    return {
      school: typeof e.institution === 'string' ? e.institution : undefined,
      degree: [e.area, e.studyType].filter(Boolean).join(' '),
      year: typeof e.year === 'string' ? e.year : undefined,
      startMonth: typeof e.startMonth === 'string' ? e.startMonth : undefined,
      startYear: typeof e.startYear === 'string' ? e.startYear : undefined,
      endMonth: typeof e.endMonth === 'string' ? e.endMonth : undefined,
      endYear: typeof e.endYear === 'string' ? e.endYear : undefined,
    };
  });
  const skillsRaw = (json.skills as Array<{ name?: string; keywords?: string[] }>) ?? [];
  const skills = skillsRaw.map((s) => ({
    category: s.name ?? 'Skills',
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
  }));
  return {
    name,
    email,
    phone,
    linkedin,
    summary: summary || undefined,
    location: location || undefined,
    experience,
    education: ed,
    skills,
  };
}

/** POST: upload resume (text or PDF) → extract JSON → save base resume + optional profile sync */
export async function postUserResume(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let resumeText: string;
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (file?.buffer) {
    try {
      resumeText = await pdfBufferToText(file.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not extract text from PDF';
      res.status(400).json({ error: message });
      return;
    }
  } else {
    const body = req.body as { resumeText?: string };
    resumeText = typeof body?.resumeText === 'string' ? body.resumeText.trim() : '';
  }

  if (!resumeText) {
    res.status(400).json({
      error: 'Provide either JSON body with resumeText (string) or upload a PDF file (field: resume).',
    });
    return;
  }

  try {
    const json = await extractResumeJsonFromText(resumeText);
    await saveBaseResume(req.userId, json);
    const profileUpdate = jsonResumeToProfile(json);
    if (profileUpdate.name || profileUpdate.email) {
      await updateProfile(profileUpdate, req.userId);
    }
    res.status(200).json({ resume: json });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract resume';
    const status =
      message.includes('OPENAI_API_KEY') || message.includes('apiKey') ? 503 : 500;
    res.status(status).json({ error: message });
  }
}

/** GET: return user's base resume JSON */
export async function getUserResume(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const resume = await getBaseResume(req.userId);
    if (!resume) {
      res.status(404).json({ error: 'No base resume found. Upload a resume first.' });
      return;
    }
    res.status(200).json({ resume });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load resume';
    res.status(500).json({ error: message });
  }
}

/** PUT: update base resume from JSON body (full or partial merge) */
export async function putUserResume(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Body must be a JSON object (resume or partial resume).' });
    return;
  }
  try {
    const existing = await getBaseResume(req.userId);
    const merged = existing ? { ...existing, ...body } : body;
    await saveBaseResume(req.userId, merged as Record<string, unknown>);
    res.status(200).json({ resume: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save resume';
    res.status(400).json({ error: message });
  }
}
