import { Drawer, Button } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getSubmittedJobList, JobListing } from "../api";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export function SubmitedJobsDrawer() {
  const [open, setOpen] = useState(false);

  const showDrawer = () => {
    setOpen(true);
  };

  const onClose = () => {
    setOpen(false);
  };

  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSubmittedJobList();
      setListings(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div>
      <Button
        type="link"
        onClick={showDrawer}
        className="text-text-muted hover:text-text"
      >
        View submitted jobs
      </Button>
      <Drawer
        title="Submitted jobs"
        closable={{ "aria-label": "Close Button" }}
        onClose={onClose}
        open={open}
        loading={loading}
      >
        <div className="">
          {listings.map((listing) => (
            <div className=" border-b p-4">
              <Link
                to={`/discover/job/${encodeURIComponent(`${listing.site}:${listing.jobId}`)}`}
              >
                <h5 className="">{listing.title}</h5>
                <p className="text-text-muted text-sm">{listing.company}</p>
              </Link>
              <p className="text-text-muted text-sm inline-flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" aria-hidden />
                Applied at{" "}
                {listing.appliedAt
                  ? new Date(listing.appliedAt).toLocaleString()
                  : "Unknown"}
              </p>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
