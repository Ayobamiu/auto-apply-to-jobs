import { Request, Response } from 'express';
import OpenAI from 'openai';
import { cover_letter_update_system_prompt, resume_patch_operations_response_format, resume_patch_operations_system_prompt } from '../../shared/prompts/resume.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Deterministic JSON serialization with sorted object keys.
 * Required so identical resume state produces byte-identical prompt
 * prefixes across requests — which is what OpenAI prompt caching
 * keys on.
 */
function stableStringify(v: unknown): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
    const keys = Object.keys(v as object).sort();
    return `{${keys
        .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
        .join(",")}}`;
}

/**
 * Remove noise that pads the prompt: empty strings, nullish values,
 * empty arrays, and empty objects (including recursively-empty ones).
 * In JSON Resume semantics, these are equivalent to "field not set".
 */
function stripEmpty<T>(input: T): T {
    if (Array.isArray(input)) {
        const arr = input
            .map((v) => stripEmpty(v as unknown))
            .filter((v) => v !== undefined);
        return arr as unknown as T;
    }
    if (input !== null && typeof input === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
            if (raw === null || raw === undefined) continue;
            if (typeof raw === "string" && raw === "") continue;
            const cleaned = stripEmpty(raw);
            if (Array.isArray(cleaned) && cleaned.length === 0) continue;
            if (
                cleaned !== null &&
                typeof cleaned === "object" &&
                !Array.isArray(cleaned) &&
                Object.keys(cleaned as object).length === 0
            ) {
                continue;
            }
            out[k] = cleaned;
        }
        return out as unknown as T;
    }
    return input;
}

/**
 * Build the user message with a *stable prefix* (resume + job context)
 * followed by the volatile *tail* (instruction). This ordering lets
 * OpenAI's automatic prompt caching reuse the prefix across edits in
 * the same session.
 */
function buildUserMessage(
    resume: Record<string, unknown>,
    instruction: string,
    jobDescription?: string,
): string {
    const parts: string[] = [];
    parts.push(`CURRENT_RESUME: ${stableStringify(stripEmpty(resume))}`);
    if (jobDescription) {
        parts.push(`JOB_CONTEXT (tailor edits to match this role): ${jobDescription.slice(0, 3000)}`);
    }
    parts.push(`INSTRUCTION: ${instruction}`);
    return parts.join("\n\n");
}

export async function postResumeUpdate(req: Request, res: Response): Promise<void> {
    const { resume, instruction, jobDescription } = req.body as {
        resume: Record<string, unknown>; instruction: string;
        jobDescription?: string;
    };
    if (!resume || !instruction || typeof resume !== 'object' || typeof instruction !== 'string') {
        res.status(400).json({ error: 'Missing or invalid resume/instruction' });
        return;
    }
    if (Object.keys(resume).length === 0) {
        res.status(400).json({ error: 'Resume is empty' });
        return;
    }
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-2024-08-06",
            messages: [
                { role: "system", content: resume_patch_operations_system_prompt },
                { role: "user", content: buildUserMessage(resume, instruction, jobDescription) },
            ],
            response_format: resume_patch_operations_response_format,
            temperature: 0.1,
        });
        const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
        res.status(200).json(parsed.patches ?? []);
    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({ error: "Failed to generate update." });
    }
}



export async function postCoverLetterUpdate(req: Request, res: Response): Promise<void> {
    const { text, instruction, jobDescription } = req.body as {
        text: string; instruction: string;
        jobDescription?: string;
    };
    if (!text || !instruction || typeof text !== 'string' || typeof instruction !== 'string') {
        res.status(400).json({ error: 'Missing or invalid text/instruction' });
        return;
    }
    try {
        const parts: string[] = [`CURRENT_COVER_LETTER:\n${text}`];
        if (jobDescription) parts.push(`JOB_CONTEXT:\n${jobDescription.slice(0, 3000)}`);
        parts.push(`INSTRUCTION: ${instruction}`);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: cover_letter_update_system_prompt },
                { role: "user", content: parts.join('\n\n') },
            ],
            temperature: 0.3,
        });
        const improved = response.choices[0].message.content?.trim() ?? text;
        res.status(200).json({ text: improved });
    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({ error: "Failed to update cover letter." });
    }
}
