import "server-only";

/**
 * Base URL for the Fastify API (e.g. http://localhost:3333).
 * Trailing slashes are stripped so callers can append paths safely.
 */
export function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new Error("API_URL environment variable is not set.");
  }
  return url.replace(/\/$/, "");
}
