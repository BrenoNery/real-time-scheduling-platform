import rateLimit from "@fastify/rate-limit";
import { ErrorCode, apiError } from "@repo/shared";
import type { FastifyInstance } from "fastify";

const DEFAULT_BOOKING_RATE_LIMIT_MAX = 10;
const DEFAULT_BOOKING_RATE_LIMIT_WINDOW_MS = 60_000;

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (got "${raw}"). See .env.example.`);
  }
  return value;
}

/**
 * Registers @fastify/rate-limit without limiting any route by default: a route opts in with
 * `config: { rateLimit: {} }`. Buckets are kept per authenticated user in memory, so the hook
 * runs in preHandler, after the route's own auth preHandler has verified the JWT.
 *
 * BOOKING_RATE_LIMIT_MAX requests per BOOKING_RATE_LIMIT_WINDOW (ms) per client; an invalid
 * value throws at startup instead of silently disabling the limit.
 */
export async function registerRateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    hook: "preHandler",
    max: readPositiveInteger("BOOKING_RATE_LIMIT_MAX", DEFAULT_BOOKING_RATE_LIMIT_MAX),
    timeWindow: readPositiveInteger(
      "BOOKING_RATE_LIMIT_WINDOW",
      DEFAULT_BOOKING_RATE_LIMIT_WINDOW_MS,
    ),
    keyGenerator: (request) => request.user.sub,
    // The plugin throws what this returns and Fastify sends it as the body: the status must be
    // readable as `statusCode` but, kept non-enumerable, stays out of the error envelope.
    errorResponseBuilder: (_request, context) =>
      Object.defineProperty(
        apiError(
          ErrorCode.RATE_LIMITED,
          `Too many booking requests. Try again in ${context.after}.`,
        ),
        "statusCode",
        { value: context.statusCode },
      ),
  });
}
