import { Request, Response } from 'express';
import OpenAI from 'openai';
import { resume_patch_operations_system_prompt } from '../../shared/prompts/resume.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response_format: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] = {
    type: "json_schema",
    json_schema: {
        name: "resume_patch_operations",
        schema: {
            type: "object",
            additionalProperties: false,
            required: ["patches"],
            properties: {
                patches: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["op", "path"],
                        properties: {
                            op: { type: "string", enum: ["replace", "add", "remove", "move", "copy"] },
                            path: { type: "string" },
                            from: { type: "string", description: "Source path for move/copy operations (RFC 6902)" },
                            value: {
                                anyOf: [
                                    { type: "string" },
                                    { type: "number" },
                                    { type: "boolean" },
                                    { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
                                    { type: "object", additionalProperties: false, required: [], properties: {} }
                                ]
                            }
                        }
                    }
                }
            }
        }
    }
};


function buildUserMessage(
    resume: Record<string, unknown>,
    instruction: string,
    jobDescription?: string,
    editHistory?: string[]
): string {
    const parts: string[] = [];
    parts.push(`CURRENT_RESUME: ${JSON.stringify(resume)}`);
    if (jobDescription) {
        const truncated = jobDescription.slice(0, 3000);
        parts.push(`JOB_CONTEXT (tailor edits to match this role): ${truncated}`);
    }
    if (editHistory?.length) {
        parts.push(`RECENT_EDIT_HISTORY: ${editHistory.slice(-5).join(' | ')}`);
    }
    parts.push(`INSTRUCTION: ${instruction}`);
    return parts.join('\n\n');
}

export async function postResumeUpdate(req: Request, res: Response): Promise<void> {
    const { resume, instruction, jobDescription, editHistory } = req.body as {
        resume: Record<string, unknown>; instruction: string;
        jobDescription?: string; editHistory?: string[];
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
                { role: "user", content: buildUserMessage(resume, instruction, jobDescription, editHistory) },
            ],
            response_format,
            temperature: 0.1,
        });
        const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
        res.status(200).json(parsed.patches ?? []);
    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({ error: "Failed to generate update." });
    }
}

const COVER_LETTER_SYSTEM_PROMPT = `Role: Professional Cover Letter Editor.

Goal: Improve or rewrite a cover letter based on user instructions.
Return the full improved text.

Rules:
- Keep it 250-400 words unless the user asks for a different length.
- Maintain professional tone.
- If a job description is provided, tailor the letter to it.
- Output ONLY the improved cover letter text. No JSON, no markdown, no explanation.`;

export async function postCoverLetterUpdate(req: Request, res: Response): Promise<void> {
    const { text, instruction, jobDescription, editHistory } = req.body as {
        text: string; instruction: string;
        jobDescription?: string; editHistory?: string[];
    };
    if (!text || !instruction || typeof text !== 'string' || typeof instruction !== 'string') {
        res.status(400).json({ error: 'Missing or invalid text/instruction' });
        return;
    }
    try {
        const parts: string[] = [`CURRENT_COVER_LETTER:\n${text}`];
        if (jobDescription) parts.push(`JOB_CONTEXT:\n${jobDescription.slice(0, 3000)}`);
        if (editHistory?.length) parts.push(`RECENT_EDITS: ${editHistory.slice(-5).join(' | ')}`);
        parts.push(`INSTRUCTION: ${instruction}`);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
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
