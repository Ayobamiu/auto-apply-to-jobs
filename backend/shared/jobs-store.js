/**
 * Single-file store for scraped jobs, keyed by site and job ID.
 * Shape: { "<site>": { "<jobId>": { ...job, jobId, site }, ... }, ... }
 * e.g. { "handshake": { "10764218": { title, company, description, url, jobId, site, applyType, ... } } }
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { PATHS } from './config.js';

function getPath() {
  return PATHS.jobsFile;
}

export function loadJobs() {
  try {
    const raw = readFileSync(getPath(), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export function saveJobs(data) {
  const path = getPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * @param {string} site - e.g. 'handshake'
 * @param {string} jobId - e.g. '10764218'
 * @returns {object | null} job or null
 */
export function getJob(site, jobId) {
  if (!site || !jobId) return null;
  const data = loadJobs();
  const siteJobs = data[site];
  if (!siteJobs || typeof siteJobs !== 'object') return null;
  return siteJobs[jobId] ?? null;
}

/**
 * @param {string} site
 * @param {string} jobId
 * @param {object} job - full job object (must include jobId and site)
 */
export function setJob(site, jobId, job) {
  if (!site || !jobId) return;
  const data = loadJobs();
  if (!data[site]) data[site] = {};
  data[site][jobId] = { ...job, jobId, site };
  saveJobs(data);
}
