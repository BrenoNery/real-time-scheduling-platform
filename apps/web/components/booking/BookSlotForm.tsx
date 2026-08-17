"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { bookSlot } from "@/lib/actions/bookings";

export interface BookSlotOption {
  id: string;
  label: string;
}

export interface BookClientOption {
  id: string;
  label: string;
}

interface BookSlotFormProps {
  slots: BookSlotOption[];
  clients: BookClientOption[];
}

function toastForError(code: string, message: string): void {
  switch (code) {
    case "SLOT_UNAVAILABLE":
      toast.error("Slot unavailable", { description: message });
      break;
    case "NOT_FOUND":
      toast.error("Not found", { description: message });
      break;
    case "VALIDATION_ERROR":
      toast.error("Validation error", { description: message });
      break;
    case "NETWORK_ERROR":
      toast.error("Connection failed", { description: message });
      break;
    default:
      toast.error("Something went wrong", { description: message });
  }
}

export function BookSlotForm({ slots, clients }: BookSlotFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">No available slots to book right now.</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const slotId = formData.get("slotId");
    const clientId = formData.get("clientId");

    if (typeof slotId !== "string" || typeof clientId !== "string") {
      toast.error("Validation error", {
        description: "Please select a slot and a client.",
      });
      return;
    }

    startTransition(async () => {
      const result = await bookSlot(slotId, clientId);
      if (result.ok) {
        toast.success("Booking confirmed.");
        formRef.current?.reset();
        return;
      }

      toastForError(result.code, result.message);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="book-slot" className="text-sm font-medium">
          Available slot
        </label>
        <select
          id="book-slot"
          name="slotId"
          required
          disabled={isPending}
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            Select a slot…
          </option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="book-client" className="text-sm font-medium">
          Client
        </label>
        <select
          id="book-client"
          name="clientId"
          required
          disabled={isPending}
          defaultValue={clients[0]?.id ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending || clients.length === 0}>
        {isPending ? "Booking…" : "Book slot"}
      </Button>
    </form>
  );
}
