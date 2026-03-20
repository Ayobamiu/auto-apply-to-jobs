/**
 * GET /jobs/find — discover jobs. Auth required.
 * Cache-first: no refresh returns cached listings + lastRefreshAt.
 * refresh=1 runs finder, updates cache, returns fresh listings.
 * All filter params persist as job_search_filters and apply to cached and refresh.
 */
import type { Request, Response } from 'express';
import { findJobs } from '../../job-finders/registry.js';
import { getCachedListings, saveDiscoveredJobs } from '../../data/user-discovered-jobs.js';
import {
  getJobSearchFilters,
  setJobSearchFilters,
  getLastRefreshAt,
  setLastRefreshAt,
} from '../../data/user-preferences.js';
import type { JobSearchFilters } from '../../data/user-preferences.js';
import { isAppError, CODES } from '../../shared/errors.js';

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

const ALLOWED_EMPLOYMENT_TYPES = new Set(['1', '2']);
const ALLOWED_JOB_TYPES = new Set(['3', '4', '5', '6', '7', '8', '9', '10']);
const ALLOWED_REMOTE_WORK = new Set(['onsite', 'remote', 'hybrid']);
const ALLOWED_WORK_AUTH = new Set([
  'openToUSVisaSponsorship',
  'openToOptionalPracticalTraining',
  'openToCurricularPracticalTraining',
  'noUSWork',
  'unknown',
]);

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v != null && v !== '') return [String(v).trim()].filter(Boolean);
  return [];
}

function parseFiltersFromQuery(query: Request['query']): Partial<JobSearchFilters> | null {
  const queryParam = typeof query.query === 'string' ? query.query.trim() : undefined;
  const locationParam = typeof query.location === 'string' ? query.location.trim() : undefined;
  const employmentTypes = toArray(query.employmentTypes).filter((x) => ALLOWED_EMPLOYMENT_TYPES.has(x));
  const jobTypes = toArray(query.jobTypes).filter((x) => ALLOWED_JOB_TYPES.has(x));
  const remoteWork = toArray(query.remoteWork).filter((x) => ALLOWED_REMOTE_WORK.has(x));
  const workAuthorization = toArray(query.workAuthorization).filter((x) => ALLOWED_WORK_AUTH.has(x));
  const pageStr = typeof query.page === 'string' ? query.page : undefined;
  const perPageStr = typeof query.perPage === 'string' ? query.perPage : undefined;
  const page = pageStr && /^\d+$/.test(pageStr) ? Math.max(1, parseInt(pageStr, 10)) : undefined;
  const perPage = perPageStr && /^\d+$/.test(perPageStr) ? Math.min(100, Math.max(1, parseInt(perPageStr, 10))) : undefined;
  const locationFilterParam = typeof query.locationFilter === 'string' ? query.locationFilter.trim() : undefined;

  const hasAny =
    queryParam !== undefined ||
    locationParam !== undefined ||
    employmentTypes.length > 0 ||
    jobTypes.length > 0 ||
    remoteWork.length > 0 ||
    workAuthorization.length > 0 ||
    page != null ||
    perPage != null ||
    (locationFilterParam != null && locationFilterParam !== '');

  if (!hasAny) return null;

  const filters: Partial<JobSearchFilters> = {};
  if (queryParam !== undefined) filters.query = queryParam || undefined;
  if (locationParam !== undefined) filters.location = locationParam || undefined;
  if (employmentTypes.length) filters.employmentTypes = employmentTypes;
  if (jobTypes.length) filters.jobTypes = jobTypes;
  if (remoteWork.length) filters.remoteWork = remoteWork;
  if (workAuthorization.length) filters.workAuthorization = workAuthorization;
  if (page != null || perPage != null) {
    filters.pagination = {
      page: page ?? 1,
      perPage: perPage ?? 25,
    };
  }
  if (locationFilterParam) {
    try {
      const parsed = JSON.parse(locationFilterParam) as unknown;
      filters.handshake = { locationFilter: typeof parsed === 'object' && parsed !== null ? parsed : locationFilterParam };
    } catch {
      filters.handshake = { locationFilter: locationFilterParam };
    }
  }
  return filters;
}

export async function getJobsFind(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const site = typeof req.query.site === 'string' ? req.query.site.trim() : undefined;
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const maxResults =
    typeof req.query.maxResults === 'string' && /^\d+$/.test(req.query.maxResults)
      ? Math.min(100, parseInt(req.query.maxResults, 10))
      : 30;

  const saved = await getJobSearchFilters(userId);
  const fromQuery = parseFiltersFromQuery(req.query);
  if (fromQuery) {
    const merged: JobSearchFilters = {
      query: fromQuery.query ?? saved?.query,
      location: fromQuery.location ?? saved?.location,
      employmentTypes: fromQuery.employmentTypes?.length ? fromQuery.employmentTypes : saved?.employmentTypes,
      jobTypes: fromQuery.jobTypes?.length ? fromQuery.jobTypes : saved?.jobTypes,
      remoteWork: fromQuery.remoteWork?.length ? fromQuery.remoteWork : saved?.remoteWork,
      workAuthorization: fromQuery.workAuthorization?.length ? fromQuery.workAuthorization : saved?.workAuthorization,
      pagination: fromQuery.pagination ?? saved?.pagination,
      handshake: fromQuery.handshake ?? saved?.handshake,
    };
    const notMergedFilters: JobSearchFilters = {
      query: fromQuery.query,
      location: fromQuery.location,
      employmentTypes: fromQuery.employmentTypes,
      jobTypes: fromQuery.jobTypes,
      remoteWork: fromQuery.remoteWork,
      workAuthorization: fromQuery.workAuthorization,
      pagination: fromQuery.pagination,
      handshake: fromQuery.handshake,
    };
    await setJobSearchFilters(userId, refresh ? notMergedFilters : merged);
  }

  const filters = await getJobSearchFilters(userId);
  if (!refresh) {
    const listings = await getCachedListings(userId, maxResults, filters);
    const lastRefreshAt = await getLastRefreshAt(userId);
    res.status(200).json({
      listings,
      lastRefreshAt: lastRefreshAt ? lastRefreshAt.toISOString() : null,
    });
    const lastAt = lastRefreshAt ? lastRefreshAt.getTime() : 0;
    const isStale = Date.now() - lastAt > STALE_MS;
    if ((listings.length === 0 || isStale) && userId) {
      setImmediate(() => {
        findJobs(userId, { site: site || 'handshake', maxResults, filters: filters ?? undefined })
          .then((fresh) => {
            if (fresh.length > 0) {
              return saveDiscoveredJobs(userId, fresh).then(() =>
                setLastRefreshAt(userId, new Date())
              );
            }
          })
          .catch(() => { });
      });
    }
    return;
  }

  try {
    const listings = await findJobs(userId, {
      site: site || 'handshake',
      maxResults,
      filters: filters ?? undefined,
    });
    await saveDiscoveredJobs(userId, listings);
    await setLastRefreshAt(userId, new Date());
    res.status(200).json({
      listings,
      lastRefreshAt: new Date().toISOString(),
    });
  } catch (err) {
    if (isAppError(err) && (err.code === CODES.NO_SESSION || err.code === CODES.SESSION_EXPIRED)) {
      res.status(400).json({
        error:
          err.code === CODES.NO_SESSION
            ? 'Connect Handshake first. Use the browser extension to upload your session.'
            : 'Handshake session expired. Please reconnect using the browser extension.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to find jobs';
    res.status(503).json({ error: message });
  }
}
