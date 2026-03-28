export interface GreenhouseJob {
    id: number;
    title: string;
    absolute_url: string;
    location: { name: string };
    updated_at: string;
    content?: string;
    departments?: { name: string }[];
    offices?: { name: string; location: string }[];
    metadata?: unknown[];
    internal_job_id?: number;
    requisition_id?: string;
    first_published?: string;
}

export interface GreenhouseResponse {
    jobs: GreenhouseJob[];
    meta?: { total: number };
}

export interface JobRow {
    site: string;
    job_id: string;
    title: string;
    company: string;
    url: string;
    apply_type: string;
    ats: string;
    greenhouse_slug: string;
    location: string | null;
    last_seen_at: string;
    updated_at: string;
    payload: object;
}
