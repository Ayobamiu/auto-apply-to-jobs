import { useCallback, useEffect, useState } from 'react';
import {
  findJobs,
  postPipeline,
  getJobDetail,
  getPipelineArtifacts,
  approvePipelineJob,
  type JobListing,
  type JobDetailResponse,
  type PipelineArtifacts,
} from '../api';
import { ReviewView } from './ReviewView';

const STORAGE_KEY_SELECTED_JOB = 'discover-selected-job-ref';

interface DiscoverJobsPageProps {
  onBackToChat: () => void;
}

const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Full-Time' },
  { value: '2', label: 'Part-Time' },
];

const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '9', label: 'Job' },
  { value: '3', label: 'Internship' },
  { value: '6', label: 'On Campus' },
  { value: '4', label: 'Co-op' },
  { value: '5', label: 'Experiential' },
  { value: '10', label: 'Volunteer' },
  { value: '7', label: 'Fellowship' },
  { value: '8', label: 'Graduate School' },
];

const REMOTE_OPTIONS: { value: string; label: string }[] = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
];

const WORK_AUTH_OPTIONS: { value: string; label: string }[] = [
  { value: 'openToUSVisaSponsorship', label: 'Visa sponsorship' },
  { value: 'openToOptionalPracticalTraining', label: 'OPT' },
  { value: 'openToCurricularPracticalTraining', label: 'CPT' },
  { value: 'noUSWork', label: 'No US work required' },
  { value: 'unknown', label: 'Unknown' },
];

function formatListAge(iso: string): string {
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  } catch {
    return '';
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

export function DiscoverJobsPage({ onBackToChat }: DiscoverJobsPageProps) {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [employmentTypes, setEmploymentTypes] = useState<Set<string>>(new Set());
  const [jobTypes, setJobTypes] = useState<Set<string>>(new Set());
  const [remoteWork, setRemoteWork] = useState<Set<string>>(new Set());
  const [workAuthorization, setWorkAuthorization] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState(25);

  const [selectedJobRef, setSelectedJobRefState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_SELECTED_JOB);
    } catch {
      return null;
    }
  });
  const setSelectedJobRef = useCallback((ref: string | null) => {
    setSelectedJobRefState(ref);
    try {
      if (ref) sessionStorage.setItem(STORAGE_KEY_SELECTED_JOB, ref);
      else sessionStorage.removeItem(STORAGE_KEY_SELECTED_JOB);
    } catch {
      /* ignore */
    }
  }, []);

  const [detail, setDetail] = useState<JobDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [reviewArtifacts, setReviewArtifacts] = useState<{ pipelineId: string; artifacts: PipelineArtifacts } | null>(null);

  const loadList = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await findJobs({
          site: 'handshake',
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
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
        setListings([]);
      } finally {
        setLoading(false);
      }
    },
    [filterQuery, filterLocation, employmentTypes, jobTypes, remoteWork, workAuthorization, perPage]
  );

  useEffect(() => {
    loadList(false);
  }, [loadList]);

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
        setDetailError(err instanceof Error ? err.message : 'Failed to load job detail');
        setDetail(null);
      }
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJobRef) {
      loadDetail(selectedJobRef);
    } else {
      setDetail(null);
      setDetailError(null);
    }
  }, [selectedJobRef, loadDetail]);

  const pipelineStatus = detail?.pipelineJob?.status;
  const isPipelineActive =
    pipelineStatus === 'pending' || pipelineStatus === 'running';

  useEffect(() => {
    if (!selectedJobRef || !isPipelineActive) return;
    const interval = setInterval(() => {
      loadDetail(selectedJobRef, true);
    }, 2500);
    return () => clearInterval(interval);
  }, [selectedJobRef, isPipelineActive, loadDetail]);

  const handleRefresh = useCallback(() => {
    loadList(true);
  }, [loadList]);

  const handleApplyFilters = useCallback(() => {
    loadList(false);
  }, [loadList]);

  const handleSelectJob = useCallback((listing: JobListing) => {
    setSelectedJobRef(jobRef(listing));
  }, [setSelectedJobRef]);

  const handleApply = useCallback(
    async (url: string) => {
      setApplyingUrl(url);
      try {
        await postPipeline(url, { submit: true });
        if (selectedJobRef) loadDetail(selectedJobRef);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Failed to start application');
      } finally {
        setApplyingUrl(null);
      }
    },
    [selectedJobRef, loadDetail]
  );

  const handleGenerate = useCallback(
    async (url: string) => {
      setGeneratingUrl(url);
      try {
        await postPipeline(url, { submit: false });
        if (selectedJobRef) loadDetail(selectedJobRef);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Failed to start generation');
      } finally {
        setGeneratingUrl(null);
      }
    },
    [selectedJobRef, loadDetail]
  );

  const handleOpenReview = useCallback(async () => {
    if (!detail?.pipelineJob?.id) return;
    try {
      const artifacts = await getPipelineArtifacts(detail.pipelineJob.id);
      setReviewArtifacts({ pipelineId: detail.pipelineJob.id, artifacts });
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load review');
    }
  }, [detail?.pipelineJob?.id]);

  const handleReviewApproved = useCallback(() => {
    setReviewArtifacts(null);
    if (selectedJobRef) loadDetail(selectedJobRef);
  }, [selectedJobRef, loadDetail]);

  const handleReviewCancelled = useCallback(() => {
    setReviewArtifacts(null);
  }, []);

  const pipeline = detail?.pipelineJob;
  const isAwaitingApproval = pipeline?.status === 'awaiting_approval';

  return (
    <div className="chat-layout flex flex-col h-full">
      <header className="chat-header flex-shrink-0">
        <h1 className="chat-header-title">Discover jobs</h1>
        <div className="chat-header-actions">
          <button type="button" className="header-btn" onClick={onBackToChat}>
            Back to Chat
          </button>
        </div>
      </header>

      <main className="discover-main flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-8" aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <span className="chat-messages-loading-dots inline-flex gap-1">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </span>
              <span className="chat-messages-loading-text text-[var(--text-muted)]">Loading jobs…</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 discover-error">
            <p className="text-[var(--text)]">{error}</p>
            <div className="flex gap-2">
              <button type="button" className="review-btn" onClick={() => loadList(false)}>
                Try again
              </button>
              <button type="button" className="review-btn review-btn-secondary" onClick={onBackToChat}>
                Back to Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Left: job list */}
            <aside className="discover-sidebar w-full sm:w-80 md:w-96 flex-shrink-0 sm:border-r border-[var(--border)] flex flex-col min-h-0 max-h-[45vh] sm:max-h-none bg-[var(--bg-card)]">
              <div className="discover-toolbar p-3 border-b border-[var(--border)] flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  className="discover-filter-input flex-1 min-w-[120px]"
                  placeholder="Keyword"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                />
                <input
                  type="text"
                  className="discover-filter-input flex-1 min-w-[120px]"
                  placeholder="Location"
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                />
                <details className="discover-filter-details w-full">
                  <summary className="discover-filter-summary cursor-pointer">Filters</summary>
                  <div className="discover-filter-grid pt-2">
                    <div className="discover-filter-group">
                      <span className="discover-filter-label">Employment type</span>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <label key={o.value} className="discover-filter-check">
                          <input
                            type="checkbox"
                            checked={employmentTypes.has(o.value)}
                            onChange={() => setEmploymentTypes((s) => toggleSet(s, o.value))}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    <div className="discover-filter-group">
                      <span className="discover-filter-label">Job type</span>
                      {JOB_TYPE_OPTIONS.map((o) => (
                        <label key={o.value} className="discover-filter-check">
                          <input
                            type="checkbox"
                            checked={jobTypes.has(o.value)}
                            onChange={() => setJobTypes((s) => toggleSet(s, o.value))}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    <div className="discover-filter-group">
                      <span className="discover-filter-label">Onsite / Remote</span>
                      {REMOTE_OPTIONS.map((o) => (
                        <label key={o.value} className="discover-filter-check">
                          <input
                            type="checkbox"
                            checked={remoteWork.has(o.value)}
                            onChange={() => setRemoteWork((s) => toggleSet(s, o.value))}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    <div className="discover-filter-group">
                      <span className="discover-filter-label">Work authorization</span>
                      {WORK_AUTH_OPTIONS.map((o) => (
                        <label key={o.value} className="discover-filter-check">
                          <input
                            type="checkbox"
                            checked={workAuthorization.has(o.value)}
                            onChange={() => setWorkAuthorization((s) => toggleSet(s, o.value))}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    <div className="discover-filter-group">
                      <span className="discover-filter-label">Per page</span>
                      <select
                        className="discover-filter-select"
                        value={perPage}
                        onChange={(e) => setPerPage(Number(e.target.value))}
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>
                </details>
                <button type="button" className="review-btn" onClick={handleApplyFilters}>
                  Apply filters
                </button>
              </div>
              <div className="discover-toolbar-right px-3 py-2 flex items-center gap-2 border-b border-[var(--border)]">
                <button type="button" className="header-btn text-sm" onClick={handleRefresh} disabled={loading}>
                  Refresh
                </button>
                {lastRefreshAt && (
                  <span className="discover-count text-sm text-[var(--text-muted)]">
                    {formatListAge(lastRefreshAt)}
                    {listings.length > 0 && ` · ${listings.length} job(s)`}
                  </span>
                )}
                {!lastRefreshAt && listings.length > 0 && (
                  <span className="discover-count text-sm text-[var(--text-muted)]">{listings.length} job(s)</span>
                )}
              </div>
              <ul className="discover-list flex-1 overflow-y-auto p-2">
                {listings.length === 0 ? (
                  <li className="discover-empty p-4 text-center text-[var(--text-muted)]">
                    <p className="mb-2">No jobs. Click Refresh or adjust filters.</p>
                    <button type="button" className="review-btn" onClick={handleRefresh}>
                      Refresh
                    </button>
                  </li>
                ) : (
                  listings.map((listing) => {
                    const ref = jobRef(listing);
                    const isSelected = selectedJobRef === ref;
                    return (
                      <li
                        key={ref}
                        role="button"
                        tabIndex={0}
                        className={`discover-item ${isSelected ? 'discover-item-selected' : ''}`}
                        onClick={() => handleSelectJob(listing)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectJob(listing);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <div className="discover-item-main">
                          {listing.companyLogoUrl && (
                            <img
                              src={listing.companyLogoUrl}
                              alt=""
                              className="w-10 h-10 rounded object-contain flex-shrink-0 bg-[var(--bg-input)]"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="discover-item-title">{listing.title || 'Untitled'}</h3>
                            {listing.company && (
                              <p className="discover-item-company">{listing.company}</p>
                            )}
                            {(listing.location || listing.salaryEmploymentType) && (
                              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                {[listing.location, listing.salaryEmploymentType].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </aside>

            {/* Right: detail panel */}
            <section className="discover-detail flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--bg)]">
              {!selectedJobRef ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center text-[var(--text-muted)]">
                  <p>Select a job from the list to view details and apply.</p>
                </div>
              ) : detailLoading ? (
                <div className="flex-1 flex items-center justify-center p-8" aria-live="polite">
                  <div className="animate-pulse flex flex-col gap-3 w-full max-w-lg">
                    <div className="h-6 bg-[var(--border)] rounded w-3/4" />
                    <div className="h-4 bg-[var(--border)] rounded w-1/2" />
                    <div className="h-4 bg-[var(--border)] rounded w-1/3 mt-4" />
                    <div className="h-20 bg-[var(--border)] rounded mt-4" />
                  </div>
                </div>
              ) : detailError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                  <p className="text-[var(--danger)]">{detailError}</p>
                  <button type="button" className="review-btn" onClick={() => selectedJobRef && loadDetail(selectedJobRef)}>
                    Try again
                  </button>
                </div>
              ) : detail ? (
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Header */}
                  <div className="flex gap-4 mb-6">
                    {detail.job.companyLogoUrl && (
                      <img
                        src={detail.job.companyLogoUrl}
                        alt=""
                        className="w-14 h-14 rounded object-contain flex-shrink-0 bg-[var(--bg-card)]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold text-[var(--text)] mb-1">
                        {detail.job.title || 'Untitled'}
                      </h2>
                      {detail.job.company && (
                        <p className="text-[var(--text-muted)] font-medium">{detail.job.company}</p>
                      )}
                      {(detail.job.location || detail.job.salaryEmploymentType) && (
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          {[detail.job.location, detail.job.salaryEmploymentType].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Next steps */}
                  <div className="mb-6 space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--text)]">Next steps</h3>
                    <div className="flex flex-col gap-4">
                      <div>
                        <button
                          type="button"
                          className="review-btn review-btn-primary w-full sm:w-auto"
                          disabled={
                            !!generatingUrl ||
                            !!applyingUrl ||
                            pipeline?.status === 'pending' ||
                            pipeline?.status === 'running' ||
                            !!detail.userState?.appliedAt
                          }
                          onClick={() => detail.job.url && handleGenerate(detail.job.url)}
                        >
                          {generatingUrl === detail.job.url
                            ? 'Generating…'
                            : pipeline?.status === 'pending' || pipeline?.status === 'running'
                              ? 'Processing…'
                              : 'Generate resume and other documents'}
                        </button>
                        <p className="text-sm text-[var(--text-muted)] mt-1.5">
                          Creates a tailored resume and cover letter for this job and saves them. You can leave and come
                          back later to review and apply.
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          className="review-btn review-btn-primary w-full sm:w-auto"
                          disabled={
                            !!applyingUrl ||
                            !!generatingUrl ||
                            pipeline?.status === 'pending' ||
                            pipeline?.status === 'running' ||
                            !!detail.userState?.appliedAt
                          }
                          onClick={() => detail.job.url && handleApply(detail.job.url)}
                        >
                          {applyingUrl === detail.job.url
                            ? 'Starting…'
                            : pipeline?.status === 'pending' || pipeline?.status === 'running'
                              ? 'Applying…'
                              : 'Apply'}
                        </button>
                        <p className="text-sm text-[var(--text-muted)] mt-1.5">
                          Uses your saved documents if you already generated them, or generates them first. Then you
                          review and submit your application on Handshake.
                        </p>
                      </div>
                    </div>
                    {detail.job.url && (
                      <a
                        href={detail.job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="review-btn review-btn-secondary inline-block"
                      >
                        Open on Handshake
                      </a>
                    )}
                  </div>

                  {/* Description */}
                  {detail.job.description && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Description</h3>
                      <div className="text-sm text-[var(--text)] whitespace-pre-wrap max-h-48 overflow-y-auto rounded p-3 bg-[var(--bg-card)]">
                        {detail.job.description.slice(0, 5000)}
                      </div>
                    </div>
                  )}

                  {/* Status / What we have */}
                  <div className="space-y-4">
                    {detail.userState?.appliedAt && (
                      <p className="text-sm text-[var(--text-muted)]">
                        Applied at {detail.userState.appliedAt}
                      </p>
                    )}
                    {detail.hasResume && (
                      <p className="text-sm text-[var(--text-muted)]">Resume on file</p>
                    )}
                    {pipeline && (
                      <div className="rounded-lg p-4 bg-[var(--bg-card)] border border-[var(--border)]">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Application status</h3>
                        <p className="text-sm text-[var(--text-muted)] capitalize">{pipeline.status.replace(/_/g, ' ')}</p>
                        {(pipeline.status === 'pending' || pipeline.status === 'running') && pipeline.phase && (
                          <p className="text-sm text-[var(--text-muted)] mt-1">{pipeline.phase}</p>
                        )}
                        {(pipeline.status === 'pending' || pipeline.status === 'running') && !pipeline.phase && (
                          <p className="text-sm text-[var(--text-muted)] mt-1">Processing…</p>
                        )}
                        {pipeline.status === 'awaiting_approval' && (
                          <div className="mt-3">
                            <button type="button" className="review-btn" onClick={handleOpenReview}>
                              Open detailed review
                            </button>
                          </div>
                        )}
                        {pipeline.status === 'done' && pipeline.userMessage && (
                          <p className="text-sm text-[var(--text)] mt-2">{pipeline.userMessage}</p>
                        )}
                        {pipeline.status === 'failed' && pipeline.error && (
                          <p className="text-sm text-[var(--danger)] mt-2">{pipeline.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      {/* Review overlay when awaiting_approval and user opened review */}
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
          />
        </div>
      )}
    </div>
  );
}
