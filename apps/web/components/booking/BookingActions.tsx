"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cancelBooking } from "@/lib/actions/bookings";

type BookingStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

interface BookingActionsProps {
  bookingId: string;
  status: BookingStatus;
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

export function BookingActions({ bookingId, status }: BookingActionsProps) {
  const [isPending, startTransition] = useTransition();

  if (status !== "CONFIRMED") {
    return null;
  }

  function handleCancel() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.ok) {
        toast.success("Booking cancelled.");
        return;
      }

      toastForError(result.code, result.message);
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={isPending}
      onClick={handleCancel}
    >
      {isPending ? "Cancelling…" : "Cancel"}
    </Button>
  );
}
