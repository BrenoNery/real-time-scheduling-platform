"use server";

import { redirect } from "next/navigation";

import { requestToken, type ActionResult } from "@/lib/api";
import { clearSessionCookie, setSessionCookie, verifySessionToken } from "@/lib/session";

export async function loginProvider(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const auth = await requestToken("/auth/login", input);
  if (!auth.ok) {
    return auth;
  }

  const session = await verifySessionToken(auth.token);
  if (session?.role !== "PROVIDER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "This sign-in is for providers. Clients can book at /book.",
    };
  }

  await setSessionCookie(auth.token);
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
