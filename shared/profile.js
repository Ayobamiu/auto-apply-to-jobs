/**
 * Profile: thin wrapper over data layer for backwards compatibility.
 * Prefer importing getProfile / updateProfile from data/profile.js.
 */
import { getProfile, updateProfile } from '../data/profile.js';

export { getProfile, updateProfile };

/** @deprecated Use getProfile() from data/profile.js */
export function loadProfile() {
  return getProfile();
}
