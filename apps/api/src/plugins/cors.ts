import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

const DEFAULT_WEB_ORIGIN = "http://localhost:3000";

export function readWebOrigin(): string {
  const raw = process.env.WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN;

  let origin: string | null = null;
  try {
    const url = new URL(raw);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin === raw) {
      origin = raw;
    }
  } catch {
    // falls through to the error below
  }
  if (!origin) {
    throw new Error(
      `WEB_ORIGIN must be a single http(s) origin such as http://localhost:3000, without path or trailing slash; "*" is not allowed (got "${raw}"). See .env.example.`,
    );
  }
  return origin;
}

/**
 * Allows browser requests only from WEB_ORIGIN (default http://localhost:3000). Other origins get
 * no Access-Control-Allow-Origin header, so the browser blocks them; requests without an Origin
 * header (the Next.js server, curl) are unaffected. Credentials stay disabled.
 */
export async function registerCorsPlugin(app: FastifyInstance): Promise<void> {
  const webOrigin = readWebOrigin();
  // A function (not a string) makes the plugin send `Vary: Origin` on every response.
  await app.register(cors, { origin: (origin, cb) => cb(null, origin === webOrigin) });
}
