import { useCallback, useEffect, useState } from 'react';
import { findJobs, postPipeline, type JobListing } from '../api';

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

export function DiscoverJobsPage({ onBackToChat }: DiscoverJobsPageProps) {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [employmentTypes, setEmploymentTypes] = useState<Set<string>>(new Set());
  const [jobTypes, setJobTypes] = useState<Set<string>>(new Set());
  const [remoteWork, setRemoteWork] = useState<Set<string>>(new Set());
  const [workAuthorization, setWorkAuthorization] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState(25);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      setApplySuccess(null);
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
    load(false);
  }, [load]);

  const handleRefresh = useCallback(() => {
    load(true);
  }, [load]);

  const handleApplyFilters = useCallback(() => {
    load(false);
  }, [load]);

  const handleApply = async (listing: JobListing) => {
    setApplyingUrl(listing.url);
    setApplySuccess(null);
    try {
      await postPipeline(listing.url, { submit: true });
      setApplySuccess(listing.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start application');
    } finally {
      setApplyingUrl(null);
    }
  };

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <h1 className="chat-header-title">Discover jobs</h1>
        <div className="chat-header-actions">
          <button type="button" className="header-btn" onClick={onBackToChat}>
            Back to Chat
          </button>
        </div>
      </header>

      <main className="discover-main">
        {loading ? (
          <div className="discover-loading" aria-live="polite">
            <span className="chat-messages-loading-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
            <span className="chat-messages-loading-text">Loading jobs…</span>
          </div>
        ) : error ? (
          <div className="discover-error">
            <p>{error}</p>
            <button type="button" className="review-btn" onClick={() => load(false)}>
              Try again
            </button>
            <button type="button" className="review-btn review-btn-secondary" onClick={onBackToChat}>
              Back to Chat
            </button>
          </div>
        ) : (
          <>
            <div className="discover-toolbar">
              <div className="discover-filters">
                <input
                  type="text"
                  className="discover-filter-input"
                  placeholder="Keyword"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                />
                <input
                  type="text"
                  className="discover-filter-input"
                  placeholder="Location"
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                />
                <details className="discover-filter-details">
                  <summary className="discover-filter-summary">Filters</summary>
                  <div className="discover-filter-grid">
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
              <div className="discover-toolbar-right">
                <button type="button" className="header-btn" onClick={handleRefresh} disabled={loading}>
                  Refresh
                </button>
                {lastRefreshAt && (
                  <span className="discover-count">
                    List from {formatListAge(lastRefreshAt)}
                    {listings.length > 0 && ` · ${listings.length} job(s)`}
                  </span>
                )}
                {!lastRefreshAt && listings.length > 0 && (
                  <span className="discover-count">{listings.length} job(s)</span>
                )}
              </div>
            </div>
            {applySuccess && (
              <div className="discover-success">
                <p>Application started — check Chat for status.</p>
                <button type="button" className="review-btn" onClick={onBackToChat}>
                  Go to Chat
                </button>
              </div>
            )}
            {listings.length === 0 ? (
              <div className="discover-empty">
                <p>No jobs to show. Click Refresh to find jobs from Handshake, or adjust filters.</p>
                <button type="button" className="review-btn" onClick={handleRefresh}>
                  Refresh
                </button>
                <button type="button" className="review-btn review-btn-secondary" onClick={onBackToChat}>
                  Back to Chat
                </button>
              </div>
            ) : (
              <ul className="discover-list">
                {listings.map((listing) => (
                  <li key={`${listing.site}-${listing.jobId}`} className="discover-item">
                    <div className="discover-item-main">
                      <h3 className="discover-item-title">{listing.title || 'Untitled'}</h3>
                      {listing.company && (
                        <p className="discover-item-company">{listing.company}</p>
                      )}
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="discover-item-link"
                      >
                        View on Handshake
                      </a>
                    </div>
                    <button
                      type="button"
                      className="discover-item-apply review-btn"
                      disabled={!!applyingUrl}
                      onClick={() => handleApply(listing)}
                    >
                      {applyingUrl === listing.url ? 'Starting…' : 'Apply'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
