/** The API returns remaining projects newest first; no remaining project means an empty workspace. */
export function getNextProjectAfterDeletion<T>(remainingProjects: T[]): T | null {
  return remainingProjects[0] || null;
}
