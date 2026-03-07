import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  FileText,
  Send,
  ExternalLink,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import {
  getJobDetail,
  postPipeline,
  getPipelineArtifacts,
  type JobDetailResponse,
  type PipelineArtifacts,
  postScrapeJobDetail,
} from "../api";
import { ReviewView } from "./ReviewView";

export function DiscoverJobDetailPage() {
  const { jobRef: encodedRef } = useParams<{ jobRef: string }>();
  const navigate = useNavigate();
  const jobRef = encodedRef ? decodeURIComponent(encodedRef) : null;

  const [detail, setDetail] = useState<JobDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scrapingDetail, setScrapingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [reviewArtifacts, setReviewArtifacts] = useState<{
    pipelineId: string;
    artifacts: PipelineArtifacts;
    previewOnly?: boolean;
  } | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const loadDetail = useCallback(async (ref: string, silent = false) => {
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    try {
      const data = await getJobDetail(ref);
      setDetail(data);
    } catch (err) {
      if (!silent) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to load job detail",
        );
        setDetail(null);
      }
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  const scrapeJobDetail = useCallback(
    async (ref: string) => {
      setScrapingDetail(true);
      try {
        const data = await postScrapeJobDetail(ref);
        setDetail((prev) => (prev ? { ...prev, job: data.job } : null));
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to scrape job detail",
        );
      } finally {
        setScrapingDetail(false);
      }
    },
    [setDetail, setDetailError, setScrapingDetail],
  );

  useEffect(() => {
    if (!jobRef) {
      navigate("/discover", { replace: true });
      return;
    }
    loadDetail(jobRef);
  }, [jobRef, loadDetail, navigate]);

  /** 
    After getting the job details, if the job doesnt have description and applyType, we need to scrape the job details from the URL using postScrapeJobDetail.
 * */
  useEffect(() => {
    if (!jobRef) return;
    if (!detail?.job.description || !detail?.job.applyType)
      scrapeJobDetail(jobRef);
  }, [jobRef, detail?.job.description, detail?.job.applyType, scrapeJobDetail]);

  const pipelineStatus = detail?.pipelineJob?.status;
  const isPipelineActive =
    pipelineStatus === "pending" || pipelineStatus === "running";

  useEffect(() => {
    if (!jobRef || !isPipelineActive) return;
    const interval = setInterval(() => loadDetail(jobRef, true), 2500);
    return () => clearInterval(interval);
  }, [jobRef, isPipelineActive, loadDetail]);

  const handleRefresh = useCallback(() => {
    if (jobRef) loadDetail(jobRef);
  }, [jobRef, loadDetail]);

  const handleApply = useCallback(
    async (url: string) => {
      setApplyingUrl(url);
      try {
        await postPipeline(url, { submit: true });
        if (jobRef) loadDetail(jobRef);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to start application",
        );
      } finally {
        setApplyingUrl(null);
      }
    },
    [jobRef, loadDetail],
  );

  const handleGenerate = useCallback(
    async (url: string) => {
      setGeneratingUrl(url);
      try {
        await postPipeline(url, { submit: false });
        if (jobRef) loadDetail(jobRef);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to start generation",
        );
      } finally {
        setGeneratingUrl(null);
      }
    },
    [jobRef, loadDetail],
  );

  const handleOpenReview = useCallback(
    async (previewOnly = false) => {
      if (!detail?.pipelineJob?.id) return;
      try {
        const artifacts = await getPipelineArtifacts(detail.pipelineJob.id);
        setReviewArtifacts({
          pipelineId: detail.pipelineJob.id,
          artifacts,
          previewOnly,
        });
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to load review",
        );
      }
    },
    [detail?.pipelineJob?.id],
  );

  const handleReviewApproved = useCallback(() => {
    setReviewArtifacts(null);
    if (jobRef) loadDetail(jobRef);
  }, [jobRef, loadDetail]);

  const handleReviewCancelled = useCallback(() => {
    setReviewArtifacts(null);
  }, []);

  const pipeline = detail?.pipelineJob;
  const appliedAt = !!detail?.userState?.appliedAt;
  const hasResume = !!detail?.hasResume;
  const showGenerate =
    !appliedAt &&
    !hasResume &&
    !(
      pipeline &&
      (pipeline.status === "awaiting_approval" || pipeline.status === "done")
    );
  const showApply =
    !appliedAt &&
    !(pipeline?.status === "failed" && pipeline?.retryAllowed === false);
  const cannotApply =
    pipeline?.status === "failed" &&
    pipeline?.retryAllowed === false &&
    !!detail?.job?.url;

  if (!jobRef) return null;

  return (
    <div className="flex flex-col min-h-full w-full max-w-3xl mx-auto">
      <header className="flex-shrink-0 border-b border-border px-4 py-3">
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-text bg-card border border-border rounded-lg no-underline hover:bg-input focus:outline-none focus:ring-2 focus:ring-accent/20"
          aria-label="Back to jobs"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back to jobs
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {detailLoading && !detail ? (
          <div className="animate-pulse flex flex-col gap-4" aria-live="polite">
            <div className="h-8 bg-border rounded w-3/4" />
            <div className="h-5 bg-border rounded w-1/2" />
            <div className="h-4 bg-border rounded w-1/3 mt-4" />
            <div className="h-24 bg-border rounded mt-4" />
          </div>
        ) : detailError && !detail ? (
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl border border-border bg-card">
            <p className="text-danger">{detailError}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                Try again
              </button>
              <Link
                to="/discover"
                className="px-4 py-2 text-sm font-medium text-text-muted bg-transparent border border-border rounded-lg hover:bg-input focus:outline-none focus:ring-2 focus:ring-accent/20 no-underline"
              >
                Back to jobs
              </Link>
            </div>
          </div>
        ) : detail ? (
          <>
            <div className="flex gap-4 mb-6">
              {detail.job.companyLogoUrl ? (
                <img
                  src={detail.job.companyLogoUrl}
                  alt=""
                  className="w-16 h-16 rounded-lg object-contain flex-shrink-0 bg-card border border-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-8 h-8 text-text-muted" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-xl md:text-2xl font-semibold text-text mb-1">
                  {detail.job.title || "Untitled"}
                </h1>
                {detail.job.company && (
                  <p className="text-text-muted font-medium">
                    {detail.job.company}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-text-muted">
                  {detail.job.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-4 h-4" aria-hidden />
                      {detail.job.location}
                    </span>
                  )}
                  {detail.job.salaryEmploymentType && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-4 h-4" aria-hidden />
                      {detail.job.salaryEmploymentType}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-text mb-3">
                Next steps
              </h2>
              <div className="flex flex-col gap-4">
                {cannotApply && (
                  <div className="rounded-xl p-4 bg-card border border-border">
                    <p className="text-sm text-text">
                      We can&apos;t apply to this job through the app.
                      {!hasResume &&
                        " Would you like to generate a resume and cover letter to use elsewhere?"}
                    </p>
                    {pipeline?.error && (
                      <p className="text-sm text-text-muted mt-1">
                        {pipeline.error}
                      </p>
                    )}
                    {!hasResume && detail.job.url && (
                      <button
                        type="button"
                        disabled={
                          !!generatingUrl ||
                          !!applyingUrl ||
                          pipeline?.status === "pending" ||
                          pipeline?.status === "running"
                        }
                        onClick={() => handleGenerate(detail.job.url!)}
                        className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 text-sm font-medium text-white bg-accent border-0 rounded-lg cursor-pointer hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {generatingUrl === detail.job.url ? (
                          <Loader2
                            className="w-4 h-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <FileText className="w-4 h-4" aria-hidden />
                        )}
                        {generatingUrl === detail.job.url
                          ? "Generating…"
                          : "Yes, generate"}
                      </button>
                    )}
                  </div>
                )}

                {showGenerate && (
                  <div>
                    <button
                      type="button"
                      disabled={
                        !!generatingUrl ||
                        !!applyingUrl ||
                        pipeline?.status === "pending" ||
                        pipeline?.status === "running"
                      }
                      onClick={() => {
                        if (cannotApply) return;
                        detail.job.url && handleGenerate(detail.job.url!);
                      }}
                      className="inline-flex items-center gap-2 w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-accent border-0 rounded-lg cursor-pointer hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {generatingUrl === detail.job.url ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      ) : (
                        <FileText className="w-4 h-4" aria-hidden />
                      )}
                      {generatingUrl === detail.job.url
                        ? "Generating…"
                        : pipeline?.status === "pending" ||
                            pipeline?.status === "running"
                          ? "Processing…"
                          : "Generate resume and other documents"}
                    </button>
                    <p className="text-sm text-text-muted mt-1.5">
                      Creates a tailored resume and cover letter for this job
                      and saves them. You can leave and come back later to
                      review and apply.
                    </p>
                  </div>
                )}
                {showApply && (
                  <div>
                    <button
                      type="button"
                      disabled={
                        !!applyingUrl ||
                        !!generatingUrl ||
                        pipeline?.status === "pending" ||
                        pipeline?.status === "running"
                      }
                      onClick={() => {
                        if (cannotApply) return;
                        detail.job.url && handleApply(detail.job.url!);
                      }}
                      className="inline-flex items-center gap-2 w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-accent border-0 rounded-lg cursor-pointer hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {applyingUrl === detail.job.url ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="w-4 h-4" aria-hidden />
                      )}
                      {applyingUrl === detail.job.url
                        ? "Starting…"
                        : pipeline?.status === "pending" ||
                            pipeline?.status === "running"
                          ? "Applying…"
                          : pipeline?.status === "failed"
                            ? "Re-apply"
                            : "Apply"}
                    </button>
                    <p className="text-sm text-text-muted mt-1.5">
                      Uses your saved documents if you already generated them,
                      or generates them first. Then you review and submit your
                      application on Handshake.
                    </p>
                  </div>
                )}
              </div>
              {detail.job.url && (
                <a
                  href={detail.job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-2 px-4 py-2 text-sm font-medium text-text-muted bg-transparent border border-border rounded-lg no-underline hover:bg-input hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden />
                  Open on Handshake
                </a>
              )}
            </section>

            {scrapingDetail && (
              <div className="flex flex-col items-center gap-4 p-8 rounded-xl border border-border bg-card">
                <p className="text-sm text-text-muted inline-flex items-center gap-2">
                  Scraping job detail...{" "}
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                </p>
              </div>
            )}
            {detail.job.description && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-text mb-2">
                  Description
                </h2>
                <div
                  className={`text-sm text-text whitespace-pre-wrap rounded-lg p-3 bg-card border border-border overflow-y-auto ${
                    descriptionExpanded ? "" : "max-h-48"
                  }`}
                >
                  {detail.job.description.slice(
                    0,
                    descriptionExpanded ? undefined : 5000,
                  )}
                </div>
                {detail.job.description.length > 5000 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((e) => !e)}
                    className="text-sm text-accent mt-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent/20 rounded"
                  >
                    {descriptionExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </section>
            )}

            <section className="space-y-4">
              {detail.userState?.appliedAt && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-text-muted inline-flex items-center gap-2">
                    <CheckCircle
                      className="w-4 h-4 text-green-600"
                      aria-hidden
                    />
                    Applied at {detail.userState.appliedAt}
                  </p>
                  {detail.pipelineJob?.id && (
                    <button
                      type="button"
                      onClick={() => handleOpenReview(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      <FileText className="w-4 h-4" aria-hidden />
                      Preview resume & cover
                    </button>
                  )}
                </div>
              )}
              {detail.hasResume && !detail.userState?.appliedAt && (
                <p className="text-sm text-text-muted">Resume on file</p>
              )}
              {pipeline && (
                <div className="rounded-xl p-4 bg-card border border-border">
                  <h3 className="text-sm font-semibold text-text mb-2">
                    Application status
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pipeline.status === "pending" ||
                    pipeline.status === "running" ? (
                      <Loader2
                        className="w-4 h-4 animate-spin text-accent"
                        aria-hidden
                      />
                    ) : pipeline.status === "awaiting_approval" ? (
                      <Clock className="w-4 h-4 text-accent" aria-hidden />
                    ) : pipeline.status === "done" ? (
                      <CheckCircle
                        className="w-4 h-4 text-green-600"
                        aria-hidden
                      />
                    ) : pipeline.status === "failed" ? (
                      <AlertCircle
                        className="w-4 h-4 text-danger"
                        aria-hidden
                      />
                    ) : null}
                    <span className="text-sm text-text capitalize">
                      {pipeline.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {(pipeline.status === "pending" ||
                    pipeline.status === "running") &&
                    pipeline.phase && (
                      <p className="text-sm text-text-muted mt-1">
                        {pipeline.phase}
                      </p>
                    )}
                  {(pipeline.status === "pending" ||
                    pipeline.status === "running") &&
                    !pipeline.phase && (
                      <p className="text-sm text-text-muted mt-1">
                        Processing…
                      </p>
                    )}
                  {pipeline.status === "awaiting_approval" && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenReview(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                      >
                        <ClipboardList className="w-4 h-4" aria-hidden />
                        Open detailed review
                      </button>
                    </div>
                  )}
                  {pipeline.status === "done" && pipeline.userMessage && (
                    <p className="text-sm text-text mt-2">
                      {pipeline.userMessage}
                    </p>
                  )}
                  {pipeline.status === "failed" && (
                    <>
                      <p className="text-sm text-danger mt-2">
                        {pipeline.error ?? "Application failed."}
                      </p>
                      {pipeline.retryAllowed === false && (
                        <>
                          {!hasResume ? (
                            <p className="text-sm text-text-muted mt-1">
                              We can&apos;t apply to this job through the app.
                              You can still generate a resume and cover letter
                              to use elsewhere.
                            </p>
                          ) : (
                            <>
                              <p className="text-sm text-text-muted mt-1">
                                We couldn&apos;t submit to this job. Your
                                generated documents are below.
                              </p>
                              {detail.pipelineJob?.id && (
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReview(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent/20"
                                  >
                                    <ClipboardList
                                      className="w-4 h-4"
                                      aria-hidden
                                    />
                                    Preview documents
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>

      {reviewArtifacts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Review application"
        >
          <ReviewView
            jobId={reviewArtifacts.pipelineId}
            artifacts={reviewArtifacts.artifacts}
            onApproved={handleReviewApproved}
            onCancelled={handleReviewCancelled}
            previewOnly={reviewArtifacts.previewOnly}
          />
        </div>
      )}
    </div>
  );
}
