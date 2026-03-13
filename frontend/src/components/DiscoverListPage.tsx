import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin,
  Briefcase,
  ChevronRight,
  RefreshCw,
  Filter,
  ExternalLink,
  CheckCircle,
  Bookmark,
  BookmarkCheck,
  Link2,
  Loader2,
} from "lucide-react";
import { findJobs, saveJob, postPipeline, getPipelineJobStatus, type JobListing } from "../api";
import { SubmitedJobsDrawer } from "./SubmitedJobsDrawer";

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

/** Extract handshake jobId from a Handshake job URL (supports common variants). */
function parseHandshakeJobRef(url: string): string | null {
  const m = url.match(/\/jobs\/(\d+)/);
  return m ? `handshake:${m[1]}` : null;
}

export function DiscoverListPage() {
  const navigate = useNavigate();
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

  // Handshake link input state
  const [handshakeUrl, setHandshakeUrl] = useState("");
  const [handshakeSubmitting, setHandshakeSubmitting] = useState(false);
  const [handshakeMsg, setHandshakeMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const handshakeMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Optimistic saved-job tracking
  const [savedRefs, setSavedRefs] = useState<Set<string>>(new Set());
  const [savingRefs, setSavingRefs] = useState<Set<string>>(new Set());

  // Floating pipeline status notification (for Handshake link starts)
  const [floating, setFloating] = useState<{
    open: boolean;
    jobId: string | null;
    jobRef: string | null;
    statusText: string;
    phase: string | null;
    lastUpdatedAt: string | null;
    done: boolean;
    error: string | null;
  }>({
    open: false,
    jobId: null,
    jobRef: null,
    statusText: "",
    phase: null,
    lastUpdatedAt: null,
    done: false,
    error: null,
  });

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

  const handleSaveJob = useCallback(async (ref: string) => {
    if (savingRefs.has(ref) || savedRefs.has(ref)) return;
    setSavingRefs((s) => new Set(s).add(ref));
    try {
      await saveJob(ref);
      setSavedRefs((s) => new Set(s).add(ref));
    } catch {
      // silently ignore; user can retry
    } finally {
      setSavingRefs((s) => { const n = new Set(s); n.delete(ref); return n; });
    }
  }, [savingRefs, savedRefs]);

  const handleHandshakeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const url = handshakeUrl.trim();
    if (!url) return;
    const ref = parseHandshakeJobRef(url);
    if (!ref) {
      setHandshakeMsg({ text: "Couldn't parse a job ID from that URL. Make sure it's a Handshake job link.", ok: false });
      return;
    }
    setHandshakeSubmitting(true);
    setHandshakeMsg(null);
    try {
      const { jobId } = await postPipeline(url, { submit: false });
      setHandshakeUrl("");
      setHandshakeMsg({ text: "Started generating documents. The job will appear in 'In Progress'.", ok: true });
      setFloating({
        open: true,
        jobId,
        jobRef: ref,
        statusText: "Starting…",
        phase: "Queued",
        lastUpdatedAt: new Date().toISOString(),
        done: false,
        error: null,
      });
      // Navigate to the job detail once we have the ref
      if (handshakeMsgTimer.current) clearTimeout(handshakeMsgTimer.current);
      handshakeMsgTimer.current = setTimeout(() => {
        navigate(`/discover/job/${encodeURIComponent(ref)}`);
      }, 1500);
    } catch (err) {
      setHandshakeMsg({ text: err instanceof Error ? err.message : "Failed to start pipeline.", ok: false });
    } finally {
      setHandshakeSubmitting(false);
    }
  }, [handshakeUrl, navigate]);

  // Poll pipeline status for the floating notification (avoid loops by keying to jobId).
  useEffect(() => {
    if (!floating.open || !floating.jobId || floating.done) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const s = await getPipelineJobStatus(floating.jobId!);
        if (cancelled) return;
        const status = s.status || "running";
        const done = status === "done" || status === "failed" || status === "cancelled";
        setFloating((prev) => ({
          ...prev,
          statusText: status.replace(/_/g, " "),
          phase: s.phase ?? null,
          lastUpdatedAt: s.updatedAt ?? new Date().toISOString(),
          done,
          error: status === "failed" ? (s.error ?? "Failed") : null,
        }));
        if (done) return;
      } catch {
        // ignore transient failures; keep polling
      }
      timer = window.setTimeout(poll, 2000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [floating.open, floating.jobId, floating.done]);

  const activeCount = countActiveFilters(
    employmentTypes,
    jobTypes,
    remoteWork,
    workAuthorization,
  );

  return (
    <div className="flex flex-col min-h-full w-full">
      <header className="flex-shrink-0 border-b border-border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-text">Discover jobs</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Handshake link input */}
          <form onSubmit={handleHandshakeSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                type="url"
                value={handshakeUrl}
                onChange={(e) => setHandshakeUrl(e.target.value)}
                placeholder="Paste Handshake job link…"
                className="pl-8 pr-3 py-2 text-sm bg-input border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent w-[220px] md:w-[280px]"
              />
            </div>
            <button
              type="submit"
              disabled={handshakeSubmitting || !handshakeUrl.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {handshakeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {handshakeSubmitting ? "Starting…" : "Start"}
            </button>
          </form>
          {handshakeMsg && (
            <span className={`text-xs ${handshakeMsg.ok ? "text-green-600" : "text-danger"}`}>
              {handshakeMsg.text}
            </span>
          )}
          <SubmitedJobsDrawer />
        </div>
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
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                        {listing.url && (
                          <a
                            href={listing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover focus:outline-none rounded no-underline"
                          >
                            <ExternalLink className="w-4 h-4" aria-hidden />
                            Open on Handshake
                          </a>
                        )}
                        {listing.applicationSubmitted ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-text-muted ml-auto">
                            <CheckCircle className="w-4 h-4 text-green-600" aria-hidden />
                            Applied
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); void handleSaveJob(ref); }}
                            disabled={savingRefs.has(ref)}
                            className="inline-flex items-center gap-1.5 ml-auto px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-transparent text-text-muted hover:text-accent hover:border-accent disabled:opacity-60 transition-colors"
                            title={savedRefs.has(ref) || listing.lifecycleStatus === 'saved' ? "Saved" : "Save job"}
                          >
                            {savingRefs.has(ref) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (savedRefs.has(ref) || listing.lifecycleStatus === 'saved') ? (
                              <BookmarkCheck className="w-3.5 h-3.5 text-accent" />
                            ) : (
                              <Bookmark className="w-3.5 h-3.5" />
                            )}
                            {(savedRefs.has(ref) || listing.lifecycleStatus === 'saved') ? "Saved" : "Save"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {/* Floating pipeline status notification */}
      {floating.open && (
        <div className="fixed bottom-6 right-6 z-[2000] w-[360px] max-w-[92vw]">
          <div className="rounded-xl border border-border bg-card shadow-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text">
                  {floating.done
                    ? floating.error
                      ? "Job failed"
                      : "Job complete"
                    : "Working on your job"}
                </div>
                <div className="text-xs text-text-muted mt-0.5 truncate">
                  {floating.jobRef ?? "Handshake job"} ·{" "}
                  {floating.phase ? floating.phase : floating.statusText}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFloating((p) => ({ ...p, open: false }))}
                className="text-xs font-semibold text-text-muted hover:text-text"
              >
                Dismiss
              </button>
            </div>

            {!floating.done && (
              <div className="mt-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span className="text-xs text-text-muted">
                  {floating.statusText}
                </span>
              </div>
            )}

            {floating.done && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`text-xs ${floating.error ? "text-danger" : "text-text-muted"}`}>
                  {floating.error ? floating.error : "You can review the documents in the job detail page."}
                </span>
                {floating.jobRef && (
                  <button
                    type="button"
                    onClick={() => navigate(`/discover/job/${encodeURIComponent(floating.jobRef!)}`)}
                    className="text-xs font-semibold text-accent hover:text-accent-hover"
                  >
                    Open
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
