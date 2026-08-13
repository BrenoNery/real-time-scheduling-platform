import type { Metadata } from "next";
import Link from "next/link";

import { BookingTable } from "@/components/booking/BookingTable";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bookings",
};

export default async function BookingsPage() {
  const bookings = await prisma.booking.findMany({
    include: {
      slot: { include: { service: true } },
      client: true,
    },
    orderBy: { bookedAt: "desc" },
  });

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
      <BookingTable bookings={bookings} />
    </main>
  );
}
