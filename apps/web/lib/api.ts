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

export type ActionError = { ok: false; code: string; message: string };

export type ActionResult = { ok: true } | ActionError;

export function networkFailure(err: unknown): ActionError {
  if (err instanceof Error && err.message.includes("API_URL")) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "API_URL is not set. Add it to the root .env and restart Next.js.",
    };
  }

  return {
    ok: false,
    code: "NETWORK_ERROR",
    message: "Could not reach the booking API. Is it running?",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseApiErrorBody(body: unknown, status: number): ActionError {
  if (isRecord(body) && isRecord(body.error)) {
    const code = body.error.code;
    const message = body.error.message;
    if (typeof code === "string" && typeof message === "string") {
      return { ok: false, code, message };
    }
  }

  // Fastify uncaught Prisma errors: { statusCode, code, error, message }
  const prismaCode = isRecord(body) ? body.code : undefined;
  const prismaMessage = isRecord(body) ? body.message : undefined;
  const text = typeof prismaMessage === "string" ? prismaMessage : "";

  if (prismaCode === "P2002" && (text.includes("slot_id") || text.includes("slotId"))) {
    return {
      ok: false,
      code: "SLOT_UNAVAILABLE",
      message: "This slot already has an active booking, so it cannot be booked again.",
    };
  }

  return {
    ok: false,
    code: typeof prismaCode === "string" ? prismaCode : "INTERNAL_ERROR",
    message:
      status >= 500
        ? "Something went wrong on the server. Please try again."
        : "The request could not be completed.",
  };
}

export async function parseApiError(response: Response): Promise<ActionError> {
  try {
    const body: unknown = await response.json();
    return parseApiErrorBody(body, response.status);
  } catch {
    return parseApiErrorBody(undefined, response.status);
  }
}

/** Calls POST /auth/login or POST /auth/register and returns the issued token. */
export async function requestToken(
  path: "/auth/login" | "/auth/register",
  body: Record<string, string>,
): Promise<{ ok: true; token: string } | ActionError> {
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return networkFailure(err);
  }

  if (!response.ok) {
    return parseApiError(response);
  }

  const { token } = (await response.json()) as { token: string };
  return { ok: true, token };
}
