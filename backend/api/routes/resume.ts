import { Request, Response } from 'express';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


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
                        required: ["op", "path", "value"],
                        properties: {
                            op: {
                                type: "string",
                                enum: ["replace", "add", "remove"]
                            },
                            path: {
                                type: "string"
                            },
                            value: {
                                anyOf: [
                                    { type: "string" },
                                    { type: "number" },
                                    { type: "boolean" },
                                    {
                                        type: "array",
                                        items: {
                                            anyOf: [
                                                { type: "string" },
                                                { type: "number" },
                                                { type: "boolean" }
                                            ]
                                        }
                                    },
                                    {
                                        type: "object",
                                        additionalProperties: false,
                                        required: [],
                                        properties: {}
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        }
    }
}
const SYSTEM_PROMPT = `
Role: Senior Resume Architect.

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

{
  "op": "add" | "replace" | "remove",
  "path": "/json/pointer/path",
  "value": <value when required>,
  "reason": "<short explanation>"
}

Return an object with a "patches" array containing JSON Patch operations.

If only one change is needed, return an array with one object.
When replacing array fields (like highlights or keywords),
always replace the entire array.

---

### PATH RULES

Use JSON Pointer paths.

Examples:

/basics/summary
/work/0/highlights
/skills/2/keywords
/projects/1/name

Array indices must be numeric.

---

### OPERATION RULES

Use:

replace → update an existing value  
add → insert new array items or fields  
remove → delete fields or array items  

Examples:

Replace highlights:

{
  "op": "replace",
  "path": "/work/0/highlights",
  "value": ["Improved bullet point"],
  "reason": "Improve clarity"
}

Insert new project:

{
  "op": "add",
  "path": "/projects/3",
  "value": {...},
  "reason": "Add requested project"
}

---

### RESUME RULES

1. Use ISO-8601 (YYYY-MM-DD) for dates when present.
2. Only modify the fields requested in the instruction.
3. Never remove or overwrite unrelated fields.
4. Do not modify the same path more than once.
5. Prefer improving clarity, impact, and conciseness in resume text.

---

### OUTPUT RULES

Return ONLY the JSON array of patch operations.
No explanations outside JSON.
`;

export async function postResumeUpdate(req: Request, res: Response): Promise<void> {
    if (req.method !== 'POST') {
        res.status(405).end();
        return;
    }

    const { resume, instruction } = req.body as unknown as { resume: Record<string, unknown>; instruction: string };
    if (!resume || !instruction) {
        res.status(400).json({ error: 'Missing resume or instruction' });
        return;
    }
    if (typeof resume !== 'object' || typeof instruction !== 'string') {
        res.status(400).json({ error: 'Invalid resume or instruction' });
        return;
    }

    if (Object.keys(resume).length === 0) {
        res.status(400).json({ error: 'Resume is empty' });
        return;
    }
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-2024-08-06", // Required for strict json_schema
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: `CURRENT_RESUME: ${JSON.stringify(resume)}\n\nINSTRUCTION: ${instruction}`
                }
            ],
            response_format,
            temperature: 0.1,
        });

        // res.status(200).json(JSON.parse(response.choices[0].message.content ?? '{}'));

        const content = response.choices[0].message.content ?? "{}";
        const parsed = JSON.parse(content);

        const patches = parsed.patches;
        res.status(200).json(patches);
    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({ error: "Failed to generate update." });
    }
}