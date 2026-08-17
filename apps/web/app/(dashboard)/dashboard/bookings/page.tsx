import type { Metadata } from "next";
import Link from "next/link";
import { Role, SlotStatus } from "@repo/database";

import { BookSlotForm } from "@/components/booking/BookSlotForm";
import { BookingTable } from "@/components/booking/BookingTable";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bookings",
};

function formatSlotLabel(serviceName: string, startsAt: Date, endsAt: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return `${serviceName} — ${formatter.format(startsAt)} – ${formatter.format(endsAt)} UTC`;
}

export default async function BookingsPage() {
  const [bookings, availableSlots, clients] = await Promise.all([
    prisma.booking.findMany({
      include: {
        slot: { include: { service: true } },
        client: true,
      },
      orderBy: { bookedAt: "desc" },
    }),
    prisma.timeSlot.findMany({
      where: {
        status: SlotStatus.AVAILABLE,
        // Soft-cancelled bookings keep the unique slot_id row, so the API
        // cannot create a second booking even when the slot looks AVAILABLE.
        booking: { is: null },
      },
      include: { service: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: Role.CLIENT },
      orderBy: { name: "asc" },
    }),
  ]);

  const slotOptions = availableSlots.map((slot) => ({
    id: slot.id,
    label: formatSlotLabel(slot.service.name, slot.startsAt, slot.endsAt),
  }));

  const clientOptions = clients.map((client) => ({
    id: client.id,
    label: `${client.name} (${client.email})`,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All bookings across every service, newest first.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">← Dashboard</Link>
        </Button>
      </div>

      <section className="mb-8 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Book a slot</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Create a booking through the API via a Server Action.
        </p>
        <BookSlotForm slots={slotOptions} clients={clientOptions} />
      </section>

      <BookingTable bookings={bookings} />
    </main>
  );
}
