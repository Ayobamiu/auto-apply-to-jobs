// ─────────────────────────────────────────────────────────────────────────────
// Profile types
// Extended fields are now top-level on Profile.
// ExtendedProfileFields is kept for reference / legacy reads, but deprecated.
// ─────────────────────────────────────────────────────────────────────────────

/** One education entry in a profile. */
export interface EducationEntry {
    school?: string;
    degree?: string;
    discipline?: string;
    year?: string;
    startMonth?: string | number;
    startYear?: string | number;
    endMonth?: string | number;
    endYear?: string | number;
    [key: string]: unknown;
}

/** One experience entry in a profile. */
export interface ExperienceEntry {
    title?: string;
    company?: string;
    location?: string;
    dates?: string;
    bullets?: string[];
    startMonth?: string | number;
    startYear?: string | number;
    endMonth?: string | number;
    endYear?: string | number;
    [key: string]: unknown;
}

/** One project entry in a profile. */
export interface ProjectEntry {
    name?: string;
    bullets?: string[];
}

/** GDPR / data compliance flags (maps to the POST body's data_compliance fields). */
export interface DataCompliance {
    /** @deprecated Use gdpr_processing_consent_given + gdpr_retention_consent_given instead. */
    gdpr_consent_given?: boolean;
    gdpr_processing_consent_given?: boolean;
    gdpr_retention_consent_given?: boolean;
    gdpr_demographic_data_consent_given?: boolean;
}

/** One EEO demographic answer (maps to demographic_answers[] in the POST body). */
export interface DemographicAnswer {
    question_id: number;
    answer_options: Array<{
        answer_option_id: number;
        text?: string; // for free-form answers
    }>;
}

export interface SkillEntry {
    category?: string;
    keywords: string[];
}

/**
 * Profile shape — matches public.profiles table.
 *
 * All previously-extended fields are promoted here.
 * The `extended` column on the DB row is deprecated and will be dropped.
 */
export interface Profile {
    // ── Core identity ──────────────────────────────────────────
    name?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    summary?: string;
    location?: string;
    title?: string;

    // ── Resume sections ────────────────────────────────────────
    education?: EducationEntry[];
    experience?: ExperienceEntry[];
    projects?: ProjectEntry[];
    /** Array of skill objects, or object mapping category → string[] */
    skills?: SkillEntry[];

    // ── Promoted from ExtendedProfileFields ───────────────────
    website?: string;
    github?: string;
    work_authorization?: string;
    requires_visa_sponsorship?: boolean;
    willing_to_relocate?: boolean;
    preferred_locations?: string[];
    /** ISO date string e.g. "2024-09-01" */
    availability_start_date?: string;
    current_degree_status?: string;
    expected_graduation?: string;
    eeo_gender?: string;
    eeo_race?: string;
    eeo_veteran_status?: string;
    eeo_disability_status?: string;
    referral_source?: string;

    // ── Net-new: location coordinates ─────────────────────────
    latitude?: number;
    longitude?: number;

    // ── Net-new: stored file references ───────────────────────
    resume_url?: string;
    cover_letter_url?: string;

    // ── Net-new: application submission metadata ───────────────
    /** Greenhouse mapped_url_token for pre-filled job application routing. */
    mapped_url_token?: string;
    data_compliance?: DataCompliance;
    demographic_answers?: DemographicAnswer[];

    // ── DB metadata ────────────────────────────────────────────
    updated_at?: string;

    /**
     * @deprecated Nulled in DB migration. Will be dropped.
     * Use top-level fields instead.
     */
    extended?: null;

    /** Catch-all for any remaining untyped payload fields. */
    payload?: Record<string, unknown>;

    [key: string]: unknown;
}

export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";
