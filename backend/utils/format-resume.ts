import type { Resume } from "../types/resume.js";
import { dedupeResumeListRows } from "../shared/normalize-resume-lists.js";

export function formatResume(resume: Partial<Resume>): Resume {
    const r: Resume = resume as Resume;

    r.basics ??= { name: "", email: "" };

    r.basics.location ??= {};
    r.basics.profiles ??= [];

    r.work ??= [];
    r.volunteer ??= [];
    r.education ??= [];
    r.awards ??= [];
    r.publications ??= [];
    r.skills ??= [];
    r.languages ??= [];
    r.interests ??= [];
    r.references ??= [];
    r.projects ??= [];

    r.meta ??= {};

    const ext = r as unknown as Record<string, unknown>;
    ext.certificates ??= [];

    // Ensure nested arrays exist
    r.work.forEach(w => {
        w.highlights ??= [];
    });

    r.volunteer.forEach(v => {
        v.highlights ??= [];
    });

    r.skills.forEach(s => {
        s.keywords ??= [];
    });

    r.interests.forEach(i => {
        i.keywords ??= [];
    });

    r.projects.forEach(p => {
        p.highlights ??= [];
        p.keywords ??= [];
        p.roles ??= [];
    });

    r.education.forEach(e => {
        e.courses ??= [];
    });

    dedupeResumeListRows(r);

    return r;
}
