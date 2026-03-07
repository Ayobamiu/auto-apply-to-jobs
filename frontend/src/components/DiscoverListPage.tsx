import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Briefcase,
  ChevronRight,
  RefreshCw,
  Filter,
  ExternalLink,
} from "lucide-react";
import { findJobs, type JobListing } from "../api";

const STORAGE_KEY_SCROLL = "discover-list-scroll";

const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Full-Time" },
  { value: "2", label: "Part-Time" },
];

const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "9", label: "Job" },
  { value: "3", label: "Internship" },
  { value: "6", label: "On Campus" },
  { value: "4", label: "Co-op" },
  { value: "5", label: "Experiential" },
  { value: "10", label: "Volunteer" },
  { value: "7", label: "Fellowship" },
  { value: "8", label: "Graduate School" },
];

const REMOTE_OPTIONS: { value: string; label: string }[] = [
  { value: "onsite", label: "Onsite" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

const WORK_AUTH_OPTIONS: { value: string; label: string }[] = [
  { value: "openToUSVisaSponsorship", label: "Visa sponsorship" },
  { value: "openToOptionalPracticalTraining", label: "OPT" },
  { value: "openToCurricularPracticalTraining", label: "CPT" },
  { value: "noUSWork", label: "No US work required" },
  { value: "unknown", label: "Unknown" },
];

function formatListAge(iso: string): string {
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  } catch {
    return "";
  }
}

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function jobRef(listing: JobListing): string {
  return `${listing.site}:${listing.jobId}`;
}

function countActiveFilters(
  employment: Set<string>,
  jobTypes: Set<string>,
  remote: Set<string>,
  workAuth: Set<string>,
): number {
  return employment.size + jobTypes.size + remote.size + workAuth.size;
}

export function DiscoverListPage() {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [employmentTypes, setEmploymentTypes] = useState<Set<string>>(
    new Set(),
  );
  const [jobTypes, setJobTypes] = useState<Set<string>>(new Set());
  const [remoteWork, setRemoteWork] = useState<Set<string>>(new Set());
  const [workAuthorization, setWorkAuthorization] = useState<Set<string>>(
    new Set(),
  );
  const [perPage, setPerPage] = useState(25);

  const loadList = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await findJobs({
          site: "handshake",
          maxResults: Math.max(perPage * 2, 50),
          refresh,
          query: filterQuery || undefined,
          location: filterLocation || undefined,
          employmentTypes: employmentTypes.size
            ? Array.from(employmentTypes)
            : undefined,
          jobTypes: jobTypes.size ? Array.from(jobTypes) : undefined,
          remoteWork: remoteWork.size ? Array.from(remoteWork) : undefined,
          workAuthorization: workAuthorization.size
            ? Array.from(workAuthorization)
            : undefined,
          page: 1,
          perPage,
        });
        setListings(res.listings);
        if (res.lastRefreshAt != null) setLastRefreshAt(res.lastRefreshAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load jobs");
        setListings([]);
      } finally {
        setLoading(false);
      }
    },
    [
      filterQuery,
      filterLocation,
      employmentTypes,
      jobTypes,
      remoteWork,
      workAuthorization,
      perPage,
    ],
  );

  useEffect(() => {
    loadList(false);
  }, [loadList]);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (raw !== null) {
      const y = parseInt(raw, 10);
      if (!Number.isNaN(y)) window.scrollTo(0, y);
      sessionStorage.removeItem(STORAGE_KEY_SCROLL);
    }
  }, []);

  const handleRefresh = useCallback(() => loadList(true), [loadList]);
  const handleApplyFilters = useCallback(() => loadList(false), [loadList]);

  const handleCardClick = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY));
    } catch {
      /* ignore */
    }
  }, []);

  const activeCount = countActiveFilters(
    employmentTypes,
    jobTypes,
    remoteWork,
    workAuthorization,
  );

  return (
    <div className="flex flex-col min-h-full w-full">
      <header className="flex-shrink-0 border-b border-border bg-card px-4 py-3">
        <h1 className="text-xl font-semibold text-text">Discover jobs</h1>
      </header>

      <main className="flex-1 w-full p-4 md:p-6">
        <div className="w-full mx-auto px-2 sm:px-4">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
              <input
                type="text"
                placeholder="Keyword"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
                className="flex-1 min-w-[120px] max-w-[240px] px-3 py-2.5 text-sm bg-input border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
              <input
                type="text"
                placeholder="Location"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
                className="flex-1 min-w-[120px] max-w-[240px] px-3 py-2.5 text-sm bg-input border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
              <div className="relative">
                <details className="group">
                  <summary className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text bg-input border border-border rounded-lg cursor-pointer list-none hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20">
                    <Filter className="w-4 h-4 text-text-muted" aria-hidden />
                    <span>Filters</span>
                    {activeCount > 0 && (
                      <span className="min-w-[1.25rem] h-5 flex items-center justify-center px-1.5 text-xs font-semibold text-white bg-accent rounded-full">
                        {activeCount}
                      </span>
                    )}
                    <ChevronRight
                      className="w-4 h-4 text-text-muted transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <div className="absolute left-0 top-full mt-2 z-50 min-w-[300px] max-w-[min(400px,90vw)] max-h-[70vh] overflow-y-auto p-4 rounded-xl border border-border bg-card shadow-xl">
                    <div className="space-y-4">
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                          Employment type
                        </span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {EMPLOYMENT_OPTIONS.map((o) => (
                            <label
                              key={o.value}
                              className="inline-flex items-center gap-2 text-sm text-text cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={employmentTypes.has(o.value)}
                                onChange={() =>
                                  setEmploymentTypes((s) =>
                                    toggleSet(s, o.value),
                                  )
                                }
                                className="w-4 h-4 accent-accent"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                          Job type
                        </span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {JOB_TYPE_OPTIONS.map((o) => (
                            <label
                              key={o.value}
                              className="inline-flex items-center gap-2 text-sm text-text cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={jobTypes.has(o.value)}
                                onChange={() =>
                                  setJobTypes((s) => toggleSet(s, o.value))
                                }
                                className="w-4 h-4 accent-accent"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                          Work style
                        </span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {REMOTE_OPTIONS.map((o) => (
                            <label
                              key={o.value}
                              className="inline-flex items-center gap-2 text-sm text-text cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={remoteWork.has(o.value)}
                                onChange={() =>
                                  setRemoteWork((s) => toggleSet(s, o.value))
                                }
                                className="w-4 h-4 accent-accent"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                          Work authorization
                        </span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {WORK_AUTH_OPTIONS.map((o) => (
                            <label
                              key={o.value}
                              className="inline-flex items-center gap-2 text-sm text-text cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={workAuthorization.has(o.value)}
                                onChange={() =>
                                  setWorkAuthorization((s) =>
                                    toggleSet(s, o.value),
                                  )
                                }
                                className="w-4 h-4 accent-accent"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Per page
                        </span>
                        <select
                          value={perPage}
                          onChange={(e) => setPerPage(Number(e.target.value))}
                          className="px-2 py-1.5 text-sm bg-input border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="px-4 py-2.5 text-sm font-medium text-white bg-accent border-0 rounded-lg cursor-pointer hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-card"
              >
                Apply
              </button>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-text-muted bg-transparent border border-border rounded-lg cursor-pointer hover:text-text hover:bg-input focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                  aria-hidden
                />
                Refresh
              </button>
              {lastRefreshAt && (
                <span className="text-sm text-text-muted">
                  List from {formatListAge(lastRefreshAt)}
                  {listings.length > 0 && ` · ${listings.length} job(s)`}
                </span>
              )}
              {!lastRefreshAt && listings.length > 0 && (
                <span className="text-sm text-text-muted">
                  {listings.length} job(s)
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              aria-live="polite"
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4 animate-pulse"
                >
                  <div className="h-12 w-12 rounded-lg bg-border mb-3" />
                  <div className="h-5 bg-border rounded w-3/4 mb-2" />
                  <div className="h-4 bg-border rounded w-1/2 mb-2" />
                  <div className="h-4 bg-border rounded w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border border-border bg-card">
              <p className="text-text">{error}</p>
              <button
                type="button"
                onClick={() => loadList(false)}
                className="px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                Try again
              </button>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border border-border bg-card text-center">
              <p className="text-text-muted">
                No jobs found. Adjust filters or refresh to try again.
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                className="px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                Refresh
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
              {listings.map((listing) => {
                const ref = jobRef(listing);
                const encodedRef = encodeURIComponent(ref);
                return (
                  <li key={ref}>
                    <div className="rounded-xl border border-border bg-card p-4 hover:border-accent hover:shadow-md transition-all">
                      <Link
                        to={`/discover/job/${encodedRef}`}
                        onClick={handleCardClick}
                        className="block text-left no-underline text-inherit focus:outline-none focus:ring-2 focus:ring-accent/20 rounded"
                      >
                        <div className="flex gap-3">
                          {listing.companyLogoUrl ? (
                            <img
                              src={listing.companyLogoUrl}
                              alt=""
                              className="w-12 h-12 rounded-lg object-contain flex-shrink-0 bg-input"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-input flex-shrink-0 flex items-center justify-center">
                              <Briefcase
                                className="w-6 h-6 text-text-muted"
                                aria-hidden
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h2 className="font-semibold text-text truncate">
                              {listing.title || "Untitled"}
                            </h2>
                            {listing.company && (
                              <p className="text-sm text-text-muted truncate">
                                {listing.company}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-text-muted">
                              {listing.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" aria-hidden />
                                  {listing.location}
                                </span>
                              )}
                              {listing.salaryEmploymentType && (
                                <span className="inline-flex items-center gap-1">
                                  <Briefcase
                                    className="w-3.5 h-3.5"
                                    aria-hidden
                                  />
                                  {listing.salaryEmploymentType}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight
                            className="w-5 h-5 text-text-muted flex-shrink-0 self-center"
                            aria-hidden
                          />
                        </div>
                      </Link>
                      {listing.url && (
                        <a
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 mt-3 pt-3 border-t border-border text-sm font-medium text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/20 rounded no-underline"
                        >
                          <ExternalLink className="w-4 h-4" aria-hidden />
                          Open on Handshake
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
