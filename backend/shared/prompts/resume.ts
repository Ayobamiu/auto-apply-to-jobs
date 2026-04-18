import OpenAI from 'openai';

export const resume_from_text_or_pdf_response_format: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] = {
    type: "json_schema",
    json_schema: {
        name: "resume_from_text_or_pdf",
        strict: true,
        schema: {
            type: "object",
            description:
                "JSON Resume. Each array (work, education, projects, volunteer, awards, certificates, publications, languages, skills, interests, references) must list each real-world entry at most once—never output repeated identical rows. basics.profiles: one entry per network. skills: one object per category name with keywords merged in that object.",
            additionalProperties: false,
            required: ["basics", "work", "education", "volunteer", "awards", "certificates", "publications", "skills", "languages", "interests", "references", "projects"],
            properties: {
                basics: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "label", "image", "email", "phone", "url", "summary", "location", "profiles"],
                    properties: {
                        name: { type: "string" },
                        label: { type: "string", description: "e.g. Web Developer" },
                        image: { type: "string", description: "URL (as per RFC 3986) to a image in JPEG or PNG format" },
                        email: { type: "string", description: "e.g. thomas@gmail.com" },
                        phone: { type: "string", description: "Phone numbers are stored as strings so use any format you like, e.g. 712-117-2923" },
                        url: { type: "string", description: "URL (as per RFC 3986) to your website, e.g. personal homepage" },
                        summary: { type: "string", description: "Write a short 2-3 sentence biography about yourself" },
                        location: {
                            type: "object",
                            additionalProperties: false,
                            required: ["address", "postalCode", "city", "countryCode", "region"],
                            properties: {
                                address: { type: "string", description: "To add multiple address lines, use \\n. For example, 1234 Glücklichkeit Straße\\nHinterhaus 5. Etage li." },
                                postalCode: { type: "string" },
                                city: { type: "string" },
                                countryCode: { type: "string", description: "code as per ISO-3166-1 ALPHA-2, e.g. US, AU, IN" },
                                region: { type: "string", description: "The general region where you live. Can be a US state, or a province, for instance." },
                            },
                        },
                        profiles: {
                            type: "array",
                            description: "Specify any number of social networks that you participate in",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["network", "username", "url"],
                                properties: {
                                    network: { type: "string", description: "e.g. Facebook or Twitter" },
                                    username: { type: "string", description: "e.g. neutralthoughts" },
                                    url: { type: "string", description: "e.g. http://twitter.example.com/neutralthoughts" },
                                },
                            },
                        },
                    },
                },
                work: {
                    type: "array",
                    description: "Each object is one distinct employment; no duplicate same employer+role+dates.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "location", "description", "position", "url", "startDate", "endDate", "summary", "highlights"],
                        properties: {
                            name: { type: "string", description: "e.g. Facebook" },
                            location: { type: "string", description: "e.g. Menlo Park, CA" },
                            description: { type: "string", description: "e.g. Social Media Company" },
                            position: { type: "string", description: "e.g. Software Engineer" },
                            url: { type: "string", description: "e.g. http://facebook.example.com" },
                            startDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            endDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            summary: { type: "string", description: "Give an overview of your responsibilities at the company" },
                            highlights: {
                                type: "array",
                                description: "Specify multiple accomplishments",
                                items: { type: "string", description: "e.g. Increased profits by 20% from 2011-2012 through viral advertising" },
                            },
                        },
                    },
                },
                education: {
                    type: "array",
                    description: "Each object is one distinct degree/program; no duplicate same institution+field+dates.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["institution", "url", "area", "studyType", "startDate", "endDate", "score", "courses"],
                        properties: {
                            institution: { type: "string", description: "e.g. Massachusetts Institute of Technology" },
                            url: { type: "string", description: "e.g. http://facebook.example.com" },
                            area: { type: "string", description: "e.g. Arts" },
                            studyType: { type: "string", description: "e.g. Bachelor" },
                            startDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            endDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            score: { type: "string", description: "grade point average, e.g. 3.67/4.0" },
                            courses: {
                                type: "array",
                                description: "List notable courses/subjects",
                                items: { type: "string", description: "e.g. H1302 - Introduction to American history" },
                            },
                        },
                    },
                },
                volunteer: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["organization", "position", "url", "startDate", "endDate", "summary", "highlights"],
                        properties: {
                            organization: { type: "string", description: "e.g. Facebook" },
                            position: { type: "string", description: "e.g. Software Engineer" },
                            url: { type: "string", description: "e.g. http://facebook.example.com" },
                            startDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            endDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            summary: { type: "string", description: "Give an overview of your responsibilities at the company" },
                            highlights: {
                                type: "array",
                                description: "Specify accomplishments and achievements",
                                items: { type: "string", description: "e.g. Increased profits by 20% from 2011-2012 through viral advertising" },
                            },
                        },
                    },
                },
                awards: {
                    type: "array",
                    description: "Specify any awards you have received throughout your professional career",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["title", "date", "awarder", "summary"],
                        properties: {
                            title: { type: "string", description: "e.g. One of the 100 greatest minds of the century" },
                            date: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            awarder: { type: "string", description: "e.g. Time Magazine" },
                            summary: { type: "string", description: "e.g. Received for my work with Quantum Physics" },
                        },
                    },
                },
                certificates: {
                    type: "array",
                    description: "One row per distinct credential; no duplicate same name+issuer+date.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "date", "url", "issuer"],
                        properties: {
                            name: { type: "string", description: "e.g. Certified Kubernetes Administrator" },
                            date: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            url: { type: "string", description: "e.g. http://example.com" },
                            issuer: { type: "string", description: "e.g. CNCF" },
                        },
                    },
                },
                publications: {
                    type: "array",
                    description: "Specify your publications through your career",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "publisher", "releaseDate", "url", "summary"],
                        properties: {
                            name: { type: "string", description: "e.g. The World Wide Web" },
                            publisher: { type: "string", description: "e.g. IEEE, Computer Magazine" },
                            releaseDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            url: { type: "string", description: "e.g. http://www.computer.org.example.com/csdl/mags/co/1996/10/rx069-abs.html" },
                            summary: { type: "string", description: "Short summary of publication. e.g. Discussion of the World Wide Web, HTTP, HTML." },
                        },
                    },
                },
                skills: {
                    type: "array",
                    description: "List out your professional skill-set",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "level", "keywords"],
                        properties: {
                            name: { type: "string", description: "e.g. Web Development" },
                            level: { type: "string", description: "e.g. Master" },
                            keywords: {
                                type: "array",
                                description: "List some keywords pertaining to this skill",
                                items: { type: "string", description: "e.g. HTML" },
                            },
                        },
                    },
                },
                languages: {
                    type: "array",
                    description: "List any other languages you speak",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["language", "fluency"],
                        properties: {
                            language: { type: "string", description: "e.g. English, Spanish" },
                            fluency: { type: "string", description: "e.g. Fluent, Beginner" },
                        },
                    },
                },
                interests: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "keywords"],
                        properties: {
                            name: { type: "string", description: "e.g. Philosophy" },
                            keywords: {
                                type: "array",
                                items: { type: "string", description: "e.g. Friedrich Nietzsche" },
                            },
                        },
                    },
                },
                references: {
                    type: "array",
                    description: "List references you have received",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "reference"],
                        properties: {
                            name: { type: "string", description: "e.g. Timothy Cook" },
                            reference: { type: "string", description: "e.g. Joe blogs was a great employee, who turned up to work at least once a week. He exceeded my expectations when it came to doing nothing." },
                        },
                    },
                },
                projects: {
                    type: "array",
                    description: "One row per distinct project; no duplicates of the same name+entity+dates.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "description", "highlights", "keywords", "startDate", "endDate", "url", "roles", "entity", "type"],
                        properties: {
                            name: { type: "string", description: "e.g. The World Wide Web" },
                            description: { type: "string", description: "Short summary of project. e.g. Collated works of 2017." },
                            highlights: {
                                type: "array",
                                description: "Specify multiple features",
                                items: { type: "string", description: "e.g. Directs you close but not quite there" },
                            },
                            keywords: {
                                type: "array",
                                description: "Specify special elements involved",
                                items: { type: "string", description: "e.g. AngularJS" },
                            },
                            startDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            endDate: { type: "string", description: "Similar to the standard date type, but each section after the year is optional. e.g. 2014-06-29 or 2023-04" },
                            url: { type: "string", description: "e.g. http://www.computer.org/csdl/mags/co/1996/10/rx069-abs.html" },
                            roles: {
                                type: "array",
                                description: "Specify your role on this project or in company",
                                items: { type: "string", description: "e.g. Team Lead, Speaker, Writer" },
                            },
                            entity: { type: "string", description: "Specify the relevant company/entity affiliations e.g. 'greenpeace', 'corporationXYZ'" },
                            type: { type: "string", description: "e.g. 'volunteering', 'presentation', 'talk', 'application', 'conference'" },
                        },
                    },
                },
            },
        },
    },
};

export const resume_patch_operations_response_format: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] = {
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


export const resume_from_text_or_pdf_system_prompt = `You are a precise resume parser. Extract information from raw resume text and populate the JSON Resume schema fields.

RULES:
- Extract only what is explicitly present in the text. Do NOT invent or infer information.
- Preserve original wording for job titles, company names, school names, and bullet points.
- For any field not found in the resume, use an empty string "" for string fields and an empty array [] for array fields.
- Never use null for any field.
- Uniqueness: never repeat the same work, education, project, volunteer role, award, certificate, publication, language, skill category, interest, reference, or social profile as multiple identical rows. Each array element must represent a distinct real-world item.
- Dates: use ISO 8601 format where possible (e.g. "2024-01-15", "2024-01", "2024"). If only a year is present, use "2024". If a job is current, use an empty string "" for endDate.
- basics.label should be the person's current or most recent job title or title if not present.
- basics.summary should be extracted from a professional summary or objective section if present, otherwise leave as empty string "".
- work[].highlights should contain bullet points or accomplishments exactly as written.
- skills should group related technologies or competencies under a category name with keywords listing the individual skills; use one skills[] object per category, never duplicate the same category name.
- For profiles, extract LinkedIn, GitHub, portfolio, or any other social/professional links found in the resume—one basics.profiles entry per network.`;


export const resume_patch_operations_system_prompt = `Role: Senior Resume Architect.
Goal: Propose precise edits to a JSON Resume as minimal JSON Patch (RFC 6902) operations.
Output schema is enforced by response_format — return ONLY the JSON object.

PATHS
- JSON Pointer (e.g. /basics/summary, /work/0/highlights, /skills/2/keywords).
- Array indices are numeric.

OPS
- replace: update an existing value.
- add: insert a new field or append an array item ("/array/-" or specific index).
- remove: delete a field or array item.
- move: reorder or relocate; requires "from", no "value".
- copy: duplicate a value; requires "from", no "value".

ARRAY GRANULARITY
- To change one or more items inside an array (highlights, keywords, courses, roles, work, skills, etc.) emit ONE "replace" on the whole array with the complete new array. Never replace individual indices like /work/0/highlights/0.
- Use "/array/N" only for "add" (appending) or "remove" (deleting one item).

REORDER / SWAP
- Prefer ONE "replace" on the full array (e.g. "/work") with the complete reordered array. Chained "move" ops on the same array are error-prone because indices shift.
  Example (swap first two work entries): { "op": "replace", "path": "/work", "value": [<entry2>, <entry1>, <entry3>, ...] }

RULES
1. Dates: ISO-8601 (YYYY-MM or YYYY-MM-DD) when present.
2. Only modify what the instruction asks for. Never touch unrelated fields.
3. Do not modify the same path more than once.
4. Prefer clarity, impact, and conciseness in resume text.
5. Minimize the number of operations.

RESUME SCHEMA (field: type — notes)
basics: name, label, image, email, phone, url, summary, location{address,postalCode,city,countryCode,region}, profiles[]{network,username,url}
work[]: name, location, description, position, url, startDate, endDate, summary, highlights[]
education[]: institution, url, area, studyType, startDate, endDate, score, courses[]
volunteer[]: organization, position, url, startDate, endDate, summary, highlights[]
awards[]: title, date, awarder, summary
certificates[]: name, date, url, issuer
publications[]: name, publisher, releaseDate, url, summary
skills[]: name, level, keywords[]
languages[]: language, fluency
interests[]: name, keywords[]
references[]: name, reference
projects[]: name, description, highlights[], keywords[], startDate, endDate, url, roles[], entity, type

[] = array of strings unless noted with []{} (array of objects). Dates: YYYY-MM or YYYY-MM-DD.`;


export const cover_letter_update_system_prompt = `Role: Professional Cover Letter Editor.

Goal: Improve or rewrite a cover letter based on user instructions.
Return the full improved text.

Rules:
- Keep it 250-400 words unless the user asks for a different length.
- Maintain professional tone.
- If a job description is provided, tailor the letter to it.
- Output ONLY the improved cover letter text. No JSON, no markdown, no explanation.`;