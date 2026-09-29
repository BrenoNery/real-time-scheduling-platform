"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { SlotGrid, type PublicSlotItem } from "@/components/booking/SlotGrid";
import { Button } from "@/components/ui/button";
import { bookPublicSlot } from "@/lib/actions/bookings";

interface BookingFormProps {
  serviceId: string;
  serviceName: string;
  slots: PublicSlotItem[];
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
    default:
      toast.error("Something went wrong", { description: message });
  }
}

export function BookingForm({ serviceId, serviceName, slots }: BookingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasSlots = slots.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending || !selectedSlotId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const email = formData.get("email");

    if (typeof name !== "string" || typeof email !== "string") {
      toast.error("Validation error", { description: "Please enter your name and email." });
      return;
    }

    startTransition(async () => {
      const result = await bookPublicSlot({
        serviceId,
        slotId: selectedSlotId,
        name,
        email,
      });

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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Button type="submit" disabled={isPending || !selectedSlotId}>
            {isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
