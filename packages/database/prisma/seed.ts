import { PrismaClient, Role, SlotStatus, BookingStatus } from "@prisma/client";

const prisma = new PrismaClient();

/** Stable demo emails used as upsert keys. */
const DEMO_PROVIDER_EMAIL = "provider@demo.local";
const DEMO_CLIENT_EMAILS = ["client1@demo.local", "client2@demo.local"] as const;

const DEMO_SERVICES = [
  {
    name: "Consultation",
    description: "Short consult for scheduling demos",
    durationMinutes: 30,
  },
  {
    name: "Deep Dive Session",
    description: "Extended session for dashboard demos",
    durationMinutes: 60,
  },
] as const;

/**
 * Idempotency: upsert users by email and services by (providerId + name).
 * For slots/bookings owned by demo services, delete then recreate so re-runs
 * never hit unique constraints or multiply rows.
 */
async function seed() {
  const provider = await prisma.user.upsert({
    where: { email: DEMO_PROVIDER_EMAIL },
    update: { name: "Demo Provider", role: Role.PROVIDER },
    create: {
      email: DEMO_PROVIDER_EMAIL,
      name: "Demo Provider",
      role: Role.PROVIDER,
    },
  });

  const clients = [];
  for (const [index, email] of DEMO_CLIENT_EMAILS.entries()) {
    const client = await prisma.user.upsert({
      where: { email },
      update: { name: `Demo Client ${index + 1}`, role: Role.CLIENT },
      create: {
        email,
        name: `Demo Client ${index + 1}`,
        role: Role.CLIENT,
      },
    });
    clients.push(client);
  }

  const services = [];
  for (const serviceDef of DEMO_SERVICES) {
    const existing = await prisma.service.findFirst({
      where: { providerId: provider.id, name: serviceDef.name },
    });

    const service = existing
      ? await prisma.service.update({
          where: { id: existing.id },
          data: {
            description: serviceDef.description,
            durationMinutes: serviceDef.durationMinutes,
          },
        })
      : await prisma.service.create({
          data: {
            providerId: provider.id,
            name: serviceDef.name,
            description: serviceDef.description,
            durationMinutes: serviceDef.durationMinutes,
          },
        });

    services.push(service);
  }

  const serviceIds = services.map((s) => s.id);

  // Remove prior demo slots/bookings (and any notification jobs) before recreate.
  const existingSlots = await prisma.timeSlot.findMany({
    where: { serviceId: { in: serviceIds } },
    select: { id: true },
  });
  const existingSlotIds = existingSlots.map((s) => s.id);

  if (existingSlotIds.length > 0) {
    const existingBookings = await prisma.booking.findMany({
      where: { slotId: { in: existingSlotIds } },
      select: { id: true },
    });
    const existingBookingIds = existingBookings.map((b) => b.id);

    if (existingBookingIds.length > 0) {
      await prisma.notificationJob.deleteMany({
        where: { bookingId: { in: existingBookingIds } },
      });
      await prisma.booking.deleteMany({
        where: { id: { in: existingBookingIds } },
      });
    }

    await prisma.timeSlot.deleteMany({
      where: { id: { in: existingSlotIds } },
    });
  }

  // Build ≥20 slots across both services with mixed statuses.
  const baseDate = nextMondayUtc(new Date());
  const slotPlans: Array<{
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: SlotStatus;
  }> = [];

  // Consultation (30m): 12 slots Mon–Tue mornings
  for (let i = 0; i < 12; i++) {
    const dayOffset = Math.floor(i / 6);
    const hour = 9 + (i % 6);
    const startsAt = atUtc(baseDate, dayOffset, hour, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const status =
      i % 5 === 0
        ? SlotStatus.BOOKED
        : i === 11
          ? SlotStatus.BLOCKED
          : SlotStatus.AVAILABLE;
    slotPlans.push({
      serviceId: services[0].id,
      startsAt,
      endsAt,
      status,
    });
  }

  // Deep Dive (60m): 12 slots Wed–Thu afternoons
  for (let i = 0; i < 12; i++) {
    const dayOffset = 2 + Math.floor(i / 6);
    const hour = 13 + (i % 6);
    const startsAt = atUtc(baseDate, dayOffset, hour, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const status =
      i % 4 === 0
        ? SlotStatus.BOOKED
        : i === 11
          ? SlotStatus.BLOCKED
          : SlotStatus.AVAILABLE;
    slotPlans.push({
      serviceId: services[1].id,
      startsAt,
      endsAt,
      status,
    });
  }

  const createdSlots = await prisma.timeSlot.createManyAndReturn({
    data: slotPlans,
  });

  const bookedSlots = createdSlots.filter((s) => s.status === SlotStatus.BOOKED);
  if (bookedSlots.length > 0) {
    await prisma.booking.createMany({
      data: bookedSlots.map((slot, index) => ({
        slotId: slot.id,
        clientId: clients[index % clients.length].id,
        status: BookingStatus.CONFIRMED,
      })),
    });
  }

  const [providerCount, serviceCount, slotCount, bookingCount, statusGroups] =
    await Promise.all([
      prisma.user.count({ where: { email: DEMO_PROVIDER_EMAIL, role: Role.PROVIDER } }),
      prisma.service.count({ where: { providerId: provider.id } }),
      prisma.timeSlot.count({ where: { serviceId: { in: serviceIds } } }),
      prisma.booking.count({
        where: { slot: { serviceId: { in: serviceIds } } },
      }),
      prisma.timeSlot.groupBy({
        by: ["status"],
        where: { serviceId: { in: serviceIds } },
        _count: { _all: true },
      }),
    ]);

  const statusSummary = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all]),
  );

  console.log("Demo seed complete:");
  console.log(`  providers: ${providerCount}`);
  console.log(`  services:  ${serviceCount}`);
  console.log(`  slots:     ${slotCount}`, statusSummary);
  console.log(`  bookings:  ${bookingCount} (must equal BOOKED slots)`);
}

function nextMondayUtc(from: Date): Date {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

function atUtc(baseMonday: Date, dayOffset: number, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(
      baseMonday.getUTCFullYear(),
      baseMonday.getUTCMonth(),
      baseMonday.getUTCDate() + dayOffset,
      hour,
      minute,
      0,
      0,
    ),
  );
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
