"use server";

import { revalidatePath } from "next/cache";

import { getApiUrl } from "@/lib/api";

export type BookingActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function networkFailure(err: unknown): BookingActionResult {
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

function parseApiErrorBody(body: unknown, status: number): BookingActionResult {
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

  if (
    prismaCode === "P2002" &&
    (text.includes("slot_id") || text.includes("slotId"))
  ) {
    return {
      ok: false,
      code: "SLOT_UNAVAILABLE",
      message:
        "This slot already has a booking (cancelled bookings still occupy the slot), so it cannot be booked again.",
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

async function parseApiError(response: Response): Promise<BookingActionResult> {
  try {
    const body: unknown = await response.json();
    return parseApiErrorBody(body, response.status);
  } catch {
    return parseApiErrorBody(undefined, response.status);
  }
}

export async function bookSlot(
  slotId: string,
  clientId: string,
): Promise<BookingActionResult> {
  let response: Response;

  try {
    response = await fetch(`${getApiUrl()}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, clientId }),
    });
  } catch (err) {
    return networkFailure(err);
  }

  if (response.ok) {
    revalidatePath("/dashboard/bookings");
    return { ok: true };
  }

  return parseApiError(response);
}

export async function cancelBooking(
  bookingId: string,
): Promise<BookingActionResult> {
  let response: Response;

  try {
    response = await fetch(`${getApiUrl()}/bookings/${bookingId}`, {
      method: "DELETE",
    });
  } catch (err) {
    return networkFailure(err);
  }

  if (response.ok) {
    revalidatePath("/dashboard/bookings");
    return { ok: true };
  }

  return parseApiError(response);
}
