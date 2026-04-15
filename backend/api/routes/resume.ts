import { Request, Response } from 'express';
import OpenAI from 'openai';

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

const SYSTEM_PROMPT = `Role: Senior Resume Architect.

Goal: Propose precise updates to a JSON Resume using JSON Patch operations (RFC 6902).
Minimize the number of patch operations required.

---

### RESUME SCHEMA BLUEPRINT

Basics:
{ name, label, image, email, phone, url, summary,
  location: { address, postalCode, city, countryCode, region },
  profiles: [{ network, username, url }]
}

Work / Volunteer:
{ organization, name, position, url, startDate, endDate, summary, highlights: [] }

Education:
{ institution, url, area, studyType, startDate, endDate, score, courses: [] }

Projects:
{ name, description, highlights: [], keywords: [], startDate, endDate, url }

Skills:
{ name, level, keywords: [] }

---

### PATCH FORMAT

Return JSON Patch operations (RFC 6902).

Each operation must contain:
{ "op": "add" | "replace" | "remove", "path": "/json/pointer/path", "value": <value when required> }

Return an object with a "patches" array containing JSON Patch operations.
When replacing array fields (like highlights or keywords), always replace the entire array.

### PATH RULES

Use JSON Pointer paths (e.g. /basics/summary, /work/0/highlights, /skills/2/keywords).
Array indices must be numeric.

### OPERATION RULES

replace → update an existing value
add → insert new array items or fields
remove → delete fields or array items
move → reorder items or relocate fields (requires "from" path, no "value" needed)
copy → duplicate a value from one path to another (requires "from" path, no "value" needed)

Example: To move work experience at index 2 to the top, use:
{ "op": "move", "from": "/work/2", "path": "/work/0" }

Reordering / swapping: Prefer ONE "replace" on the full array (e.g. "/work") with the complete reordered array of objects. Chaining multiple "move" ops on the same array is error-prone because array indices shift after each move (e.g. swapping #1 and #2 with two moves often rotates three items instead).

### RESUME RULES

1. Use ISO-8601 (YYYY-MM-DD) for dates when present.
2. Only modify the fields requested in the instruction.
3. Never remove or overwrite unrelated fields.
4. Do not modify the same path more than once.
5. Prefer improving clarity, impact, and conciseness in resume text.

### OUTPUT RULES

Return ONLY the JSON object with patches array. No explanations outside JSON.`;

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
                { role: "system", content: SYSTEM_PROMPT },
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
