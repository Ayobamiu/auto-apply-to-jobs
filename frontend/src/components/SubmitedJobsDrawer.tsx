import { Drawer, Tabs } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getJobLifecycleList, type JobListing } from "../api";
import { Link } from "react-router-dom";
import {
  CheckCircle,
  Loader2,
  Bookmark,
  Clock,
  Briefcase,
  ClipboardList,
} from "lucide-react";

type LifecycleTab = "saved" | "in_progress" | "submitted";

function jobPath(listing: JobListing) {
  return `/discover/job/${encodeURIComponent(`${listing.site}:${listing.jobId}`)}`;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <ClipboardList className="w-8 h-8 text-text-muted opacity-40" />
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  );
}

function JobRow({ listing }: { listing: JobListing }) {
  const status = listing.lifecycleStatus;
  return (
    <div className="border-b border-border last:border-0 py-3 px-1">
      <Link
        to={jobPath(listing)}
        className="no-underline text-inherit hover:text-accent block"
      >
        <p className="font-medium text-sm text-text truncate">
          {listing.title || "Untitled"}
        </p>
        <p className="text-xs text-text-muted truncate">{listing.company}</p>
      </Link>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
        {status === "submitted" ? (
          <>
            <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
            Applied
            {listing.appliedAt && (
              <span>· {new Date(listing.appliedAt).toLocaleDateString()}</span>
            )}
          </>
        ) : status === "in_progress" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
            In progress
          </>
        ) : (
          <>
            <Bookmark className="w-3.5 h-3.5 text-accent shrink-0" />
            Saved
            {listing.savedAt && (
              <span>· {new Date(listing.savedAt).toLocaleDateString()}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LifecycleTabContent({
  status,
  active,
}: {
  status: LifecycleTab;
  active: boolean;
}) {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getJobLifecycleList(status);
      setListings(res);
      setFetched(true);
    } catch {
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
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
      </div>
    );
  }

  if (!listings.length) {
    const labels: Record<LifecycleTab, string> = {
      saved: "No saved jobs yet. Click 'Save' on any job to keep track of it.",
      in_progress:
        "No jobs in progress. Start generating documents or applying to see jobs here.",
      submitted: "No submitted jobs yet. Apply to a job to see it here.",
    };
    return <EmptyState label={labels[status]} />;
  }

  return (
    <div>
      {listings.map((l) => (
        <JobRow key={`${l.site}:${l.jobId}`} listing={{ ...l, lifecycleStatus: status }} />
      ))}
    </div>
  );
}

export function SubmitedJobsDrawer() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<LifecycleTab>("saved");

  const tabItems = [
    {
      key: "saved" as LifecycleTab,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5" /> Saved
        </span>
      ),
      children: <LifecycleTabContent status="saved" active={open && activeTab === "saved"} />,
    },
    {
      key: "in_progress" as LifecycleTab,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> In Progress
        </span>
      ),
      children: (
        <LifecycleTabContent
          status="in_progress"
          active={open && activeTab === "in_progress"}
        />
      ),
    },
    {
      key: "submitted" as LifecycleTab,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" /> Submitted
        </span>
      ),
      children: (
        <LifecycleTabContent
          status="submitted"
          active={open && activeTab === "submitted"}
        />
      ),
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-text-muted hover:text-text bg-transparent border border-border rounded-lg hover:bg-input transition-colors"
      >
        <Briefcase className="w-4 h-4" />
        My Jobs
      </button>
      <Drawer
        title="My Jobs"
        closable={{ "aria-label": "Close" }}
        onClose={() => setOpen(false)}
        open={open}
        width={360}
        styles={{ body: { padding: "8px 12px" } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as LifecycleTab)}
          items={tabItems}
          size="small"
        />
      </Drawer>
    </>
  );
}
