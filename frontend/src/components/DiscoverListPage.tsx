import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Briefcase,
  Search,
  ExternalLink,
  CheckCircle,
  Bookmark,
  BookmarkCheck,
  Link2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Building2,
} from "lucide-react";
import {
  searchJobs,
  saveJob,
  type JobListing,
  type SearchJobsResult,
} from "../api";
import { HandshakeLinkModal } from "./HandshakeLinkModal";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingChecklist } from "./onboarding/OnboardingChecklist";

const STORAGE_KEY_SCROLL = "discover-list-scroll";

function jobRef(listing: JobListing): string {
  return `${listing.site}:${listing.jobId}`;
}

// save search query, location, page, perPage to url search params
// when user navigates to the page, load the search query, location, page, perPage from url search params
// when user changes the search query, location, page, perPage, update the url search params
// when user navigates to the page, load the search query, location, page, perPage from url search params
const PER_PAGE = 30;
export function DiscoverListPage() {
  const [listings, setListings] = useState<SearchJobsResult["listings"]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handshakeModalOpen, setHandshakeModalOpen] = useState(false);
  const [savedRefs, setSavedRefs] = useState<Set<string>>(new Set());
  const [savingRefs, setSavingRefs] = useState<Set<string>>(new Set());
  const scrollTimerRef = useRef<number | null>(null);

  const setUrlParams = (key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.pushState({}, "", url.toString());
  };

  const getUrlParams = (key: string) => {
    const url = new URL(window.location.href);
    return url.searchParams.get(key);
  };

  useEffect(() => {
    void handleSearch();
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (raw !== null) {
      const y = parseInt(raw, 10);
      if (!Number.isNaN(y)) window.scrollTo(0, y);
      sessionStorage.removeItem(STORAGE_KEY_SCROLL);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current != null)
        window.clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const query = getUrlParams("query");
  const location = getUrlParams("location");
  let page = parseInt(getUrlParams("page") || "1", 10);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await searchJobs({
        query: query != null ? query : undefined,
        location: location != null ? location : undefined,
        page: page,
        perPage: PER_PAGE,
      });
      setListings(res.listings);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      setUrlParams("page", page.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY));
    } catch {
      /* ignore */
    }
  }, []);

  const handleSaveJob = useCallback(
    async (ref: string) => {
      if (savingRefs.has(ref) || savedRefs.has(ref)) return;
      setSavingRefs((s) => new Set(s).add(ref));
      try {
        await saveJob(ref);
        setSavedRefs((s) => new Set(s).add(ref));
      } catch {
        /* ignore */
      } finally {
        setSavingRefs((s) => {
          const n = new Set(s);
          n.delete(ref);
          return n;
        });
      }
    },
    [savingRefs, savedRefs],
  );

  const {
    isComplete,
    loading: onboardingLoading,
    completion,
  } = useOnboarding();

  if (onboardingLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isComplete) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <OnboardingChecklist />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      {/* Hero: paste link */}
      {completion.handshake_connected && (
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Have a specific job in mind?
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste a job link and we'll generate a tailored resume and cover
              letter.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHandshakeModalOpen(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors border-0 cursor-pointer"
          >
            <Link2 className="w-4 h-4" />
            Paste link
          </button>
        </div>
      )}
      {/* Search bar: pure html form */}
      <div className="mb-6 mx-auto max-w-3xl">
        <form
          action="/discover"
          method="get"
          className="flex items-center gap-2 flex-wrap"
        >
          <input
            type="text"
            placeholder="Search jobs…"
            defaultValue={getUrlParams("query") || ""}
            name="query"
            className="flex-1 min-w-[140px] max-w-xs px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Location"
            defaultValue={getUrlParams("location") || ""}
            name="location"
            className="flex-1 min-w-[120px] max-w-[200px] px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 border-0 rounded-xl hover:bg-blue-700 cursor-pointer transition-colors"
          >
            <Search className="w-4 h-4" />
            Search
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
        </form>

        {/* Results count */}
        {!loading && totalCount > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            {totalCount.toLocaleString()} job{totalCount === 1 ? "" : "s"} found
            {getUrlParams("query") && (
              <> for &ldquo;{getUrlParams("query")}&rdquo;</>
            )}
          </p>
        )}
      </div>

      {/* Job list */}
      {loading ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
          {Array.from({ length: 9 }).map((_, i) => (
            <li
              key={i}
              className="rounded-2xl border border-gray-100 bg-white p-5 animate-pulse"
            >
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
            onClick={async () => await handleSearch()}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 border-0 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-gray-500 text-sm">
            No jobs found. Try adjusting your search.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
            {listings.map((listing) => {
              const ref = jobRef(listing);
              const encodedRef = encodeURIComponent(ref);
              const isSaved =
                savedRefs.has(ref) || listing.lifecycleStatus === "saved";
              const isSaving = savingRefs.has(ref);
              const departments = (listing as any).departments as
                | { name: string }[]
                | undefined;

              return (
                <li key={ref}>
                  <div className="group rounded-2xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-md transition-all duration-150">
                    <Link
                      to={`/discover/job/${encodedRef}`}
                      onClick={handleCardClick}
                      className="block p-5 no-underline text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t-2xl"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={`https://img.logo.dev/name/${listing.greenhouseSlug}?token=pk_KbY3qMJCR4-UaMWRec3YVg`}
                          alt=""
                          className="w-11 h-11 rounded-xl object-contain flex-shrink-0 bg-gray-50 border border-gray-100"
                        />
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold text-[14px] text-gray-900 leading-snug">
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
                        {/* location should show at most two lines with optional ellipsis */}
                        {listing.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[200px]">
                              {listing.location}
                            </span>
                          </span>
                        )}
                        {departments && departments.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {departments[0].name}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 px-5 pb-4 pt-1">
                      {/* {listing.url && (
                        <a
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 no-underline transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View
                        </a>
                      )} */}
                      {listing.applicationSubmitted ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Applied
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            void handleSaveJob(ref);
                          }}
                          disabled={isSaving || isSaved}
                          title={isSaved ? "Saved" : "Save job"}
                          className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            isSaved
                              ? "border-blue-200 text-blue-600 bg-blue-50"
                              : "border-gray-200 text-gray-500 bg-white hover:border-blue-300 hover:text-blue-600"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                type="button"
                disabled={page <= 1}
                onClick={async () => {
                  setUrlParams("page", (page - 1).toString());
                  page -= 1;
                  void handleSearch();
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {getUrlParams("page") || "1"} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={async () => {
                  setUrlParams("page", (page + 1).toString());
                  page = page + 1;
                  void handleSearch();
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      <HandshakeLinkModal
        open={handshakeModalOpen}
        onClose={() => setHandshakeModalOpen(false)}
      />
    </div>
  );
}
