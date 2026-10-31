"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { SlotGrid, type PublicSlotItem } from "@/components/booking/SlotGrid";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { bookPublicSlot } from "@/lib/actions/bookings";

const inputClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface BookingFormProps {
  serviceId: string;
  serviceName: string;
  slots: PublicSlotItem[];
  /** Label of the signed-in client, or null when the visitor must log in or register. */
  signedInAs: string | null;
}

function toastForError(code: string, message: string): void {
  switch (code) {
    case "SLOT_UNAVAILABLE":
      toast.error("Slot unavailable", { description: message });
      break;
    case "VALIDATION_ERROR":
      toast.error("Validation error", { description: message });
      break;
    case "NOT_FOUND":
      toast.error("Not found", { description: message });
      break;
    case "NETWORK_ERROR":
      toast.error("Connection failed", { description: message });
      break;
    case "INVALID_CREDENTIALS":
      toast.error("Sign-in failed", { description: message });
      break;
    case "EMAIL_TAKEN":
      toast.error("Email already registered", { description: message });
      break;
    case "UNAUTHORIZED":
      toast.error("Sign in required", { description: message });
      break;
    case "FORBIDDEN":
      toast.error("Not allowed", { description: message });
      break;
    default:
      toast.error("Something went wrong", { description: message });
  }
}

export function BookingForm({ serviceId, serviceName, slots, signedInAs }: BookingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [isPending, startTransition] = useTransition();

  const hasSlots = slots.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending || !selectedSlotId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const field = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" ? value : "";
    };
    const account = signedInAs
      ? undefined
      : { mode, name: field("name"), email: field("email"), password: field("password") };

    startTransition(async () => {
      const result = await bookPublicSlot({ serviceId, slotId: selectedSlotId, account });

      if (result.ok) {
        toast.success("Booking confirmed.");
        setSelectedSlotId(null);
        formRef.current?.reset();
        return;
      }

      toastForError(result.code, result.message);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Available times</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a slot for {serviceName}, then enter your details.
        </p>
        <div className="mt-4">
          <SlotGrid
            slots={slots}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            disabled={isPending}
          />
        </div>
      </div>

      {hasSlots ? (
        <div className="flex flex-col gap-4 sm:max-w-md">
          {signedInAs ? (
            <p className="text-sm text-muted-foreground">
              Booking as <span className="font-medium text-foreground">{signedInAs}</span>.{" "}
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => signOut())}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Sign out
              </button>
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {mode === "register" ? "New here? Create an account to book." : "Welcome back."}{" "}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setMode(mode === "register" ? "login" : "register")}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {mode === "register" ? "I already have an account" : "Create an account"}
                </button>
              </p>

              {mode === "register" ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="book-name" className="text-sm font-medium">
                    Your name
                  </label>
                  <input
                    id="book-name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    disabled={isPending}
                    maxLength={200}
                    className={inputClassName}
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="book-email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="book-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  disabled={isPending}
                  className={inputClassName}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="book-password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="book-password"
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  disabled={isPending}
                  className={inputClassName}
                />
              </div>
            </>
          )}

          <Button type="submit" disabled={isPending || !selectedSlotId}>
            {isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
