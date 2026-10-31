"use server";

import { revalidatePath } from "next/cache";
import { SlotStatus } from "@repo/database";

import {
  getApiUrl,
  networkFailure,
  parseApiError,
  requestToken,
  type ActionError,
  type ActionResult,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import { clearSessionCookie, getSessionToken, setSessionCookie } from "@/lib/session";

const MAX_CLIENT_NAME_LENGTH = 200;

const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientAccountInput = {
  mode: "register" | "login";
  name: string;
  email: string;
  password: string;
};

export type BookPublicSlotInput = {
  serviceId: string;
  slotId: string;
  /** Omitted when the visitor is already signed in as a client. */
  account?: ClientAccountInput;
};

function validationError(message: string): ActionError {
  return { ok: false, code: "VALIDATION_ERROR", message };
}

function validateAccount({ mode, name, email, password }: ClientAccountInput): ActionError | null {
  if (mode === "register") {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return validationError("Please enter your name.");
    }
    if (trimmedName.length > MAX_CLIENT_NAME_LENGTH) {
      return validationError(`Name must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`);
    }
  }

  if (!EMAIL_PATTERN.test(email.trim())) {
    return validationError("Please enter a valid email address.");
  }

  if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) {
    return validationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (password.length === 0) {
    return validationError("Please enter your password.");
  }

  return null;
}

/** Logs the client in (or registers them) and stores the token in the session cookie. */
async function signInClient(
  account: ClientAccountInput,
): Promise<{ ok: true; token: string } | ActionError> {
  const invalid = validateAccount(account);
  if (invalid) {
    return invalid;
  }

  const auth =
    account.mode === "register"
      ? await requestToken("/auth/register", {
          name: account.name,
          email: account.email,
          password: account.password,
        })
      : await requestToken("/auth/login", { email: account.email, password: account.password });

  if (auth.ok) {
    await setSessionCookie(auth.token);
  }
  return auth;
}

export async function bookPublicSlot(input: BookPublicSlotInput): Promise<ActionResult> {
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

  let token: string | undefined;
  if (input.account) {
    const auth = await signInClient(input.account);
    if (!auth.ok) {
      return auth;
    }
    token = auth.token;
  } else {
    token = await getSessionToken();
  }

  if (!token) {
    return { ok: false, code: "UNAUTHORIZED", message: "Please sign in to book." };
  }

  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slotId: input.slotId }),
    });
  } catch (err) {
    return networkFailure(err);
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Expired or invalid session: drop it so the page asks for credentials again.
      await clearSessionCookie();
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "Your session has expired. Please sign in again.",
      };
    }
    return parseApiError(response);
  }

  revalidatePath("/book");
  revalidatePath(`/book/${input.serviceId}`);
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const token = await getSessionToken();
  let response: Response;

  try {
    response = await fetch(`${getApiUrl()}/bookings/${bookingId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
