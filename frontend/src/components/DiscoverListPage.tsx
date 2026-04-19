import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { HandshakeLinkModal } from "./HandshakeLinkModal";
import { PipelineTray } from "./PipelineTray";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingChecklist } from "./onboarding/OnboardingChecklist";

// const STORAGE_KEY_SCROLL = "discover-list-scroll";

// function jobRef(listing: JobListing): string {
//   return `${listing.site}:${listing.jobId}`;
// }

// save search query, location, page, perPage to url search params
// when user navigates to the page, load the search query, location, page, perPage from url search params
// when user changes the search query, location, page, perPage, update the url search params
// when user navigates to the page, load the search query, location, page, perPage from url search params
// const PER_PAGE = 30;
export function DiscoverListPage() {
  // const [listings, setListings] = useState<SearchJobsResult["listings"]>([]);
  // const [totalCount, setTotalCount] = useState(0);
  // const [totalPages, setTotalPages] = useState(0);
  // const [loading, setLoading] = useState(true);
  // const [error, setError] = useState<string | null>(null);
  const [handshakeModalOpen, setHandshakeModalOpen] = useState(false);
  // const [savedRefs, setSavedRefs] = useState<Set<string>>(new Set());
  // const [savingRefs, setSavingRefs] = useState<Set<string>>(new Set());
  // const scrollTimerRef = useRef<number | null>(null);

  // const setUrlParams = (key: string, value: string) => {
  //   const url = new URL(window.location.href);
  //   url.searchParams.set(key, value);
  //   window.history.pushState({}, "", url.toString());
  // };

  // const getUrlParams = (key: string) => {
  //   const url = new URL(window.location.href);
  //   return url.searchParams.get(key);
  // };

  // useEffect(() => {
  //   void handleSearch();
  // }, []);

  // useEffect(() => {
  //   const raw = sessionStorage.getItem(STORAGE_KEY_SCROLL);
  //   if (raw !== null) {
  //     const y = parseInt(raw, 10);
  //     if (!Number.isNaN(y)) window.scrollTo(0, y);
  //     sessionStorage.removeItem(STORAGE_KEY_SCROLL);
  //   }
  // }, []);

  // useEffect(() => {
  //   return () => {
  //     if (scrollTimerRef.current != null)
  //       window.clearTimeout(scrollTimerRef.current);
  //   };
  // }, []);

  // const query = getUrlParams("query");
  // const location = getUrlParams("location");
  // let page = parseInt(getUrlParams("page") || "1", 10);

  // const handleSearch = async () => {
  //   setLoading(true);
  //   setError(null);

  //   try {
  //     const res = await searchJobs({
  //       query: query != null ? query : undefined,
  //       location: location != null ? location : undefined,
  //       page: page,
  //       perPage: PER_PAGE,
  //     });
  //     setListings(res.listings);
  //     setTotalCount(res.totalCount);
  //     setTotalPages(res.totalPages);
  //     setUrlParams("page", page.toString());
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : "Failed to load jobs");
  //     setListings([]);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const handleCardClick = useCallback(() => {
  //   try {
  //     sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY));
  //   } catch {
  //     /* ignore */
  //   }
  // }, []);

  // const handleSaveJob = useCallback(
  //   async (ref: string) => {
  //     if (savingRefs.has(ref) || savedRefs.has(ref)) return;
  //     setSavingRefs((s) => new Set(s).add(ref));
  //     try {
  //       await saveJob(ref);
  //       setSavedRefs((s) => new Set(s).add(ref));
  //     } catch {
  //       /* ignore */
  //     } finally {
  //       setSavingRefs((s) => {
  //         const n = new Set(s);
  //         n.delete(ref);
  //         return n;
  //       });
  //     }
  //   },
  //   [savingRefs, savedRefs],
  // );

  const { isComplete, loading: onboardingLoading } = useOnboarding();

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
      <div className="rounded-2xl bg-white border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Have a Handshake job in mind?
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Paste the link and Merit will tailor your resume, fill the forms,
            and submit — automatically.
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

      <PipelineTray variant="inline" />

      <HandshakeLinkModal
        open={handshakeModalOpen}
        onClose={() => setHandshakeModalOpen(false)}
      />
    </div>
  );
}
