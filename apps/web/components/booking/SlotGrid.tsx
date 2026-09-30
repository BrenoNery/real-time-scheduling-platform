"use client";

import { formatSlotTimeRange } from "@/lib/format-slot";

export interface PublicSlotItem {
  id: string;
  startsAt: string;
  endsAt: string;
}

interface SlotGridProps {
  slots: PublicSlotItem[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  disabled?: boolean;
}

export function SlotGrid({ slots, selectedSlotId, onSelectSlot, disabled }: SlotGridProps) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No available slots for this service right now. Check back later.
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {slots.map((slot) => {
        const isSelected = selectedSlotId === slot.id;
        const label = formatSlotTimeRange(new Date(slot.startsAt), new Date(slot.endsAt));

        return (
          <li key={slot.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectSlot(slot.id)}
              aria-pressed={isSelected}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-input bg-card hover:bg-accent/50"
              }`}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
