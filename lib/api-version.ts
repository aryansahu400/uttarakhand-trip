/**
 * Sent as `X-Trip-Api: 2` on every API response from this version (route handlers through lib/session.ts
 * withErrors, the signed-out 401 in auth.config.ts and the unknown-path 404). The phone only uploads saved
 * entries to a server that shows it, so a rollback to a release without duplicate protection can never turn
 * retries into duplicates. Plain constants: safe to import from the edge middleware.
 */
export const API_VERSION_HEADER = "X-Trip-Api";
export const API_VERSION = "2";
