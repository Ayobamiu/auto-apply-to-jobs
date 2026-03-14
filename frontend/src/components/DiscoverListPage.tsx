import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Briefcase,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  CheckCircle,
  Bookmark,
  BookmarkCheck,
  Link2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  findJobs,
  saveJob,
  type JobListing,
} from "../api";
import { HandshakeLinkModal } from "./HandshakeLinkModal";

const STORAGE_KEY_SCROLL = "discover-list-scroll";

const EMPLOYMENT_OPTIONS = [
  { value: "1", label: "Full-Time" },
  { value: "2", label: "Part-Time" },
];
const JOB_TYPE_OPTIONS = [
  { value: "9", label: "Job" },
  { value: "3", label: "Internship" },
  { value: "6", label: "On Campus" },
  { value: "4", label: "Co-op" },
  { value: "5", label: "Experiential" },
  { value: "10", label: "Volunteer" },
  { value: "7", label: "Fellowship" },
  { value: "8", label: "Graduate School" },
];
const REMOTE_OPTIONS = [
  { value: "onsite", label: "Onsite" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];
const WORK_AUTH_OPTIONS = [
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

/** A single pill checkbox group */
function PillGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
              selected.has(o.value)
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DiscoverListPage() {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [employmentTypes, setEmploymentTypes] = useState<Set<string>>(new Set());
  const [jobTypes, setJobTypes] = useState<Set<string>>(new Set());
  const [remoteWork, setRemoteWork] = useState<Set<string>>(new Set());
  const [workAuthorization, setWorkAuthorization] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Handshake modal
  const [handshakeModalOpen, setHandshakeModalOpen] = useState(false);

  // Optimistic saved-job tracking
  const [savedRefs, setSavedRefs] = useState<Set<string>>(new Set());
  const [savingRefs, setSavingRefs] = useState<Set<string>>(new Set());

  const scrollTimerRef = useRef<number | null>(null);

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
          employmentTypes: employmentTypes.size ? Array.from(employmentTypes) : undefined,
          jobTypes: jobTypes.size ? Array.from(jobTypes) : undefined,
          remoteWork: remoteWork.size ? Array.from(remoteWork) : undefined,
          workAuthorization: workAuthorization.size ? Array.from(workAuthorization) : undefined,
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
    [filterQuery, filterLocation, employmentTypes, jobTypes, remoteWork, workAuthorization, perPage],
  );

  useEffect(() => { loadList(false); }, [loadList]);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (raw !== null) {
      const y = parseInt(raw, 10);
      if (!Number.isNaN(y)) window.scrollTo(0, y);
      sessionStorage.removeItem(STORAGE_KEY_SCROLL);
    }
  }, []);

  useEffect(() => {
    return () => { if (scrollTimerRef.current != null) window.clearTimeout(scrollTimerRef.current); };
  }, []);

  const handleRefresh = useCallback(() => loadList(true), [loadList]);
  const handleApplyFilters = useCallback(() => { setFiltersOpen(false); loadList(false); }, [loadList]);

  const handleCardClick = useCallback(() => {
    try { sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY)); } catch { /* ignore */ }
  }, []);

  const handleSaveJob = useCallback(
    async (ref: string) => {
      if (savingRefs.has(ref) || savedRefs.has(ref)) return;
      setSavingRefs((s) => new Set(s).add(ref));
      try {
        await saveJob(ref);
        setSavedRefs((s) => new Set(s).add(ref));
      } catch {
        // silently ignore
      } finally {
        setSavingRefs((s) => { const n = new Set(s); n.delete(ref); return n; });
      }
    },
    [savingRefs, savedRefs],
  );

  const activeCount = countActiveFilters(employmentTypes, jobTypes, remoteWork, workAuthorization);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      {/* Hero: paste Handshake link */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Have a specific job in mind?
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Paste a Handshake link and we'll generate a tailored resume and cover letter.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHandshakeModalOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors border-0 cursor-pointer"
        >
          <Link2 className="w-4 h-4" />
          Paste link
        </button>
      </div>

      {/* Search & filter bar */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search jobs…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
            className="flex-1 min-w-[140px] max-w-xs px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
          <input
            type="text"
            placeholder="Location"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
            className="flex-1 min-w-[120px] max-w-[200px] px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border rounded-xl transition-colors cursor-pointer ${
              filtersOpen || activeCount > 0
                ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeCount > 0 && (
              <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-indigo-600 rounded-full">
                {activeCount}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleApplyFilters}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 border-0 rounded-xl hover:bg-indigo-700 cursor-pointer transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Fetch new listings from Handshake"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-60 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="mt-3 p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-5">
            <PillGroup
              label="Employment type"
              options={EMPLOYMENT_OPTIONS}
              selected={employmentTypes}
              onToggle={(v) => setEmploymentTypes((s) => toggleSet(s, v))}
            />
            <PillGroup
              label="Job type"
              options={JOB_TYPE_OPTIONS}
              selected={jobTypes}
              onToggle={(v) => setJobTypes((s) => toggleSet(s, v))}
            />
            <PillGroup
              label="Work style"
              options={REMOTE_OPTIONS}
              selected={remoteWork}
              onToggle={(v) => setRemoteWork((s) => toggleSet(s, v))}
            />
            <PillGroup
              label="Work authorization"
              options={WORK_AUTH_OPTIONS}
              selected={workAuthorization}
              onToggle={(v) => setWorkAuthorization((s) => toggleSet(s, v))}
            />
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              <label className="text-xs font-medium text-gray-500">Results per page</label>
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setEmploymentTypes(new Set());
                    setJobTypes(new Set());
                    setRemoteWork(new Set());
                    setWorkAuthorization(new Set());
                  }}
                  className="ml-auto text-xs text-red-500 hover:text-red-600 bg-transparent border-0 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}

        {/* Meta row */}
        {(lastRefreshAt || listings.length > 0) && !loading && (
          <p className="mt-3 text-xs text-gray-400">
            {lastRefreshAt
              ? `Updated ${formatListAge(lastRefreshAt)} · ${listings.length} job${listings.length === 1 ? "" : "s"}`
              : `${listings.length} job${listings.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      {/* Job list */}
      {loading ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
          {Array.from({ length: 9 }).map((_, i) => (
            <li key={i} className="rounded-2xl border border-gray-100 bg-white p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-gray-600">{error}</p>
          <button
            type="button"
            onClick={() => loadList(false)}
            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 border-0 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-gray-500 text-sm">
            No jobs found. Try adjusting your filters or refreshing.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 border-0 cursor-pointer"
          >
            Refresh listings
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
          {listings.map((listing) => {
            const ref = jobRef(listing);
            const encodedRef = encodeURIComponent(ref);
            const isSaved =
              savedRefs.has(ref) || listing.lifecycleStatus === "saved";
            const isSaving = savingRefs.has(ref);

            return (
              <li key={ref}>
                <div className="group rounded-2xl border border-gray-100 bg-white hover:border-indigo-200 hover:shadow-md transition-all duration-150">
                  <Link
                    to={`/discover/job/${encodedRef}`}
                    onClick={handleCardClick}
                    className="block p-5 no-underline text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-t-2xl"
                  >
                    <div className="flex items-start gap-3">
                      {listing.companyLogoUrl ? (
                        <img
                          src={listing.companyLogoUrl}
                          alt=""
                          className="w-11 h-11 rounded-xl object-contain flex-shrink-0 bg-gray-50 border border-gray-100"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-[14px] text-gray-900 truncate leading-snug">
                          {listing.title || "Untitled"}
                        </h2>
                        {listing.company && (
                          <p className="text-[13px] text-gray-500 truncate mt-0.5">
                            {listing.company}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-gray-400">
                      {listing.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {listing.location}
                        </span>
                      )}
                      {listing.salaryEmploymentType && (
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {listing.salaryEmploymentType}
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Footer row */}
                  <div className="flex items-center gap-2 px-5 pb-4 pt-1">
                    {listing.url && (
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 no-underline transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Handshake
                      </a>
                    )}
                    {listing.applicationSubmitted ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Applied
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void handleSaveJob(ref); }}
                        disabled={isSaving || isSaved}
                        title={isSaved ? "Saved" : "Save job"}
                        className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          isSaved
                            ? "border-indigo-200 text-indigo-600 bg-indigo-50"
                            : "border-gray-200 text-gray-500 bg-white hover:border-indigo-300 hover:text-indigo-600"
                        } disabled:opacity-60`}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isSaved ? (
                          <BookmarkCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Handshake link modal */}
      <HandshakeLinkModal
        open={handshakeModalOpen}
        onClose={() => setHandshakeModalOpen(false)}
      />
    </div>
  );
}
