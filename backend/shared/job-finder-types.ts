/**
 * Shared types and interface for job discovery (find jobs from Handshake, etc.).
 * Site-agnostic so new sources (LinkedIn, Indeed) can implement the same contract.
 */

export interface JobListing {
  site: string;
  jobId: string;
  url: string;
  title?: string;
  company?: string;
  location?: string;
  salaryEmploymentType?: string;
  companyLogoUrl?: string;
  applicationSubmitted?: boolean;
  appliedAt?: string;
}

/** Shared search filters; each site finder maps these to its own URL/API params. */
export interface SearchFilters {
  query?: string;
  location?: string;
  employmentTypes?: string[];
  jobTypes?: string[];
  remoteWork?: string[];
  workAuthorization?: string[];
  pagination?: { page: number; perPage: number };
  /** Handshake-only: full locationFilter JSON when available. */
  handshake?: { locationFilter?: string | object };
}

export interface FindJobsOptions {
  maxResults?: number;
  filters?: SearchFilters;
}

export interface JobFinder {
  findJobs(userId: string, options?: FindJobsOptions): Promise<JobListing[]>;
}

export interface JobFinderResult {
  listings: JobListing[];
  source: string;
}
