import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Clock,
  CheckCircle,
  Loader2,
  Briefcase,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { getJobLifecycleList, type JobListing } from "../api";

type LifecycleTab = "saved" | "in_progress" | "submitted";

const TABS: { key: LifecycleTab; label: string; icon: typeof Bookmark }[] = [
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "in_progress", label: "In Progress", icon: Clock },
  { key: "submitted", label: "Submitted", icon: CheckCircle },
];

function jobPath(listing: JobListing): string {
  return `/discover/job/${encodeURIComponent(`${listing.site}:${listing.jobId}`)}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function EmptyState({ tab }: { tab: LifecycleTab }) {
  const copy: Record<LifecycleTab, { title: string; body: string }> = {
    saved: {
      title: "No saved jobs yet",
      body: "Click the Save button on any job to keep track of it here.",
    },
    in_progress: {
      title: "No jobs in progress",
      body: "Start generating documents or applying to a job and it'll appear here.",
    },
    submitted: {
      title: "No applications yet",
      body: "Once you submit an application, you'll see it tracked here.",
    },
  };
  const { title, body } = copy[tab];
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
        <Briefcase className="w-7 h-7 text-gray-300" />
      </div>
      <p className="text-[15px] font-medium text-gray-700">{title}</p>
      <p className="text-sm text-gray-400 max-w-xs">{body}</p>
      {tab !== "submitted" && (
        <Link
          to="/discover"
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 no-underline transition-colors"
        >
          Discover jobs
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function JobCard({ listing }: { listing: JobListing }) {
  const status = listing.lifecycleStatus;

  return (
    <Link
      to={jobPath(listing)}
      className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-sm no-underline text-inherit transition-all group"
    >
      {/* Logo */}
      <img
        src={`https://img.logo.dev/name/${listing.greenhouseSlug}?token=pk_KbY3qMJCR4-UaMWRec3YVg`}
        alt=""
        className="w-11 h-11 rounded-xl object-contain flex-shrink-0 bg-gray-50 border border-gray-100"
      />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] text-gray-900 truncate leading-snug">
          {listing.title || "Untitled"}
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {listing.company}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400">
          {listing.location && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {listing.location}
            </span>
          )}
          {status === "submitted" && listing.appliedAt && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              Applied {formatDate(listing.appliedAt)}
            </span>
          )}
          {status === "saved" && listing.savedAt && (
            <span>Saved {formatDate(listing.savedAt)}</span>
          )}
          {status === "in_progress" && (
            <span className="inline-flex items-center gap-1 text-blue-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              In progress
            </span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
    </Link>
  );
}

function TabContent({
  status,
  active,
}: {
  status: LifecycleTab;
  active: boolean;
}) {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJobLifecycleList(status);
      setListings(res);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (active && !fetched) void load();
  }, [active, fetched, load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            setFetched(false);
            void load();
          }}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-transparent border-0 cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!listings.length) return <EmptyState tab={status} />;

  return (
    <div className="space-y-3">
      {listings.map((l) => (
        <JobCard
          key={`${l.site}:${l.jobId}`}
          listing={{ ...l, lifecycleStatus: status }}
        />
      ))}
    </div>
  );
}

export function MyJobsPage() {
  const [activeTab, setActiveTab] = useState<LifecycleTab>("saved");

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">My Jobs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track the jobs you've saved, applied to, or are actively working on.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer border-0 ${
              activeTab === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700 bg-transparent"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {TABS.map(({ key }) => (
        <div key={key} className={activeTab === key ? "block" : "hidden"}>
          <TabContent status={key} active={activeTab === key} />
        </div>
      ))}
    </div>
  );
}
