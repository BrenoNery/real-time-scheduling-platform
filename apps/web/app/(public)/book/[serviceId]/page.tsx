import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlotStatus } from "@repo/database";

import { BookingForm } from "@/components/booking/BookingForm";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ serviceId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { serviceId } = await params;
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { name: true },
  });

  if (!service) {
    return { title: "Service not found" };
  }

  return { title: `Book ${service.name}` };
}

export default async function BookServicePage({ params }: PageProps) {
  const { serviceId } = await params;

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    notFound();
  }

  const slots = await prisma.timeSlot.findMany({
    where: {
      serviceId,
      status: SlotStatus.AVAILABLE,
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const slotItems = slots.map((slot) => ({
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
          {service.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/book">All services</Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <BookingForm serviceId={service.id} serviceName={service.name} slots={slotItems} />
      </section>
    </main>
  );
}
