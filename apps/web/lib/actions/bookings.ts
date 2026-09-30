"use server";

import { revalidatePath } from "next/cache";
import { Role, SlotStatus } from "@repo/database";

import { getApiUrl } from "@/lib/api";
import { prisma } from "@/lib/db";

const MAX_CLIENT_NAME_LENGTH = 200;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BookingActionResult = { ok: true } | { ok: false; code: string; message: string };

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

async function parseApiError(response: Response): Promise<BookingActionResult> {
  try {
    const body: unknown = await response.json();
    return parseApiErrorBody(body, response.status);
  } catch {
    return parseApiErrorBody(undefined, response.status);
  }
}

export type BookPublicSlotInput = {
  serviceId: string;
  slotId: string;
  name: string;
  email: string;
};

function validationError(message: string): BookingActionResult {
  return { ok: false, code: "VALIDATION_ERROR", message };
}

async function resolveClientId(name: string, email: string): Promise<BookingActionResult | { clientId: string }> {
  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (trimmedName.length === 0) {
    return validationError("Please enter your name.");
  }

  if (trimmedName.length > MAX_CLIENT_NAME_LENGTH) {
    return validationError(`Name must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`);
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return validationError("Please enter a valid email address.");
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    if (existing.role !== Role.CLIENT) {
      return validationError("This email is already registered with a different account type.");
    }

    return { clientId: existing.id };
  }

  try {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: trimmedName,
        role: Role.CLIENT,
      },
    });

    return { clientId: created.id };
  } catch (err) {
    const code = isRecord(err) ? err.code : undefined;
    if (code === "P2002") {
      const raced = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (raced?.role === Role.CLIENT) {
        return { clientId: raced.id };
      }
    }

    throw err;
  }
}

export async function bookPublicSlot(input: BookPublicSlotInput): Promise<BookingActionResult> {
  const slot = await prisma.timeSlot.findFirst({
    where: {
      id: input.slotId,
      serviceId: input.serviceId,
      status: SlotStatus.AVAILABLE,
    },
    select: { id: true },
  });

  if (!slot) {
    return {
      ok: false,
      code: "SLOT_UNAVAILABLE",
      message: "This slot is no longer available. Please choose another time.",
    };
  }

  const clientResult = await resolveClientId(input.name, input.email);
  if (!("clientId" in clientResult)) {
    return clientResult;
  }

  const bookingResult = await bookSlot(input.slotId, clientResult.clientId);
  if (!bookingResult.ok) {
    return bookingResult;
  }

  revalidatePath("/book");
  revalidatePath(`/book/${input.serviceId}`);
  return { ok: true };
}

export async function bookSlot(slotId: string, clientId: string): Promise<BookingActionResult> {
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

export async function cancelBooking(bookingId: string): Promise<BookingActionResult> {
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
