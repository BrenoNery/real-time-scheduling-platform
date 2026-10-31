import { jwtVerify } from "jose";
import { cookies } from "next/headers";

/** One httpOnly cookie holds the API token for both roles. */
export const SESSION_COOKIE = "session";

/** Same lifetime as the token the API signs (1h). */
const SESSION_MAX_AGE_SECONDS = 60 * 60;

export type Session = { sub: string; role: string };

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verifies a token issued by the API (HS256, same JWT_SECRET). Returns null when the
 * token is missing, malformed, tampered with or expired.
 */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) {
    return null;
  }

  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getSession(): Promise<Session | null> {
  return verifySessionToken(await getSessionToken());
}

/** Only callable from Server Actions or Route Handlers. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Only callable from Server Actions or Route Handlers. */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
