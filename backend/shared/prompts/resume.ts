import OpenAI from 'openai';

export const resume_from_text_or_pdf_response_format: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] = {
    type: "json_schema",
    json_schema: {
        name: "resume_from_text_or_pdf",
        strict: true,
        schema: {
            type: "object",
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
                    description: "Specify any certificates you have received throughout your professional career",
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
                    description: "Specify career projects",
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

export const resume_from_text_or_pdf_system_prompt = `You are a precise resume parser. Extract information from raw resume text and populate the JSON Resume schema fields.

RULES:
- Extract only what is explicitly present in the text. Do NOT invent or infer information.
- Preserve original wording for job titles, company names, school names, and bullet points.
- For any field not found in the resume, use an empty string "" for string fields and an empty array [] for array fields.
- Never use null for any field.
- Dates: use ISO 8601 format where possible (e.g. "2024-01-15", "2024-01", "2024"). If only a year is present, use "2024". If a job is current, use an empty string "" for endDate.
- basics.label should be the person's current or most recent job title or title if not present.
- basics.summary should be extracted from a professional summary or objective section if present, otherwise leave as empty string "".
- work[].highlights should contain bullet points or accomplishments exactly as written.
- skills should group related technologies or competencies under a category name with keywords listing the individual skills.
- For profiles, extract LinkedIn, GitHub, portfolio, or any other social/professional links found in the resume.`;