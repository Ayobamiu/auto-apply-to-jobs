import { Request, Response } from 'express';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const response_format: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] = {
    type: "json_schema",
    json_schema: {
        name: "resume_single_update",
        strict: true,
        schema: {
            type: "object",
            properties: {
                path: { type: "string" },

                action: {
                    type: "string",
                    enum: ["update", "insert", "delete"]
                },

                reason: { type: "string" },

                value: {
                    type: ["string", "array"],
                    items: { type: "string" }
                },

                block: {
                    anyOf: [
                        { type: "null" },
                        {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                organization: { type: "string" },
                                position: { type: "string" },
                                url: { type: "string" },
                                startDate: { type: "string" },
                                endDate: { type: "string" },
                                summary: { type: "string" },
                                highlights: { type: "array", items: { type: "string" } },
                                institution: { type: "string" },
                                area: { type: "string" },
                                studyType: { type: "string" },
                                score: { type: "string" },
                                level: { type: "string" },
                                keywords: { type: "array", items: { type: "string" } },
                                description: { type: "string" }
                            },
                            required: [
                                "name",
                                "organization",
                                "position",
                                "url",
                                "startDate",
                                "endDate",
                                "summary",
                                "highlights",
                                "institution",
                                "area",
                                "studyType",
                                "score",
                                "level",
                                "keywords",
                                "description"
                            ],
                            additionalProperties: false
                        }
                    ]
                }
            },

            required: ["path", "action", "reason", "value", "block"],
            additionalProperties: false
        }
    }
}

const SYSTEM_PROMPT = `Role: Senior Resume Architect. Goal: Propose surgical updates to a JSON Resume.
  
  ### RESUME SCHEMA BLUEPRINT:
  - Basics: { name, label, image, email, phone, url, summary, location: { address, postalCode, city, countryCode, region }, profiles: [{ network, username, url }] }
  - Work/Volunteer: { organization, name, position, url, startDate, endDate, summary, highlights: [] }
  - Education: { institution, url, area, studyType, startDate, endDate, score, courses: [] }
  - Projects: { name, description, highlights: [], keywords: [], startDate, endDate, url }
  - Skills: { name, level, keywords: [] }
  
  ### RULES:
  1. Use ISO-8601 (YYYY-MM-DD) for all dates.
  2. For 'insert', use the next available index (e.g., if work has 2 items, use work[2]).
  3. Only return the changes requested.
  
  If updating a specific field (like highlights, summary, or keywords),
  ONLY return the new value in "value".

  Do NOT return a full block unless the action is "insert".
  
  Never remove or overwrite fields that are not explicitly requested in the instruction.
  When updating a field such as highlights or summary, return the new value in "value" and set block to null.`;

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

        res.status(200).json(JSON.parse(response.choices[0].message.content ?? '{}'));
    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({ error: "Failed to generate update." });
    }
}