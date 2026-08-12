import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { BookingStatus, Role, SlotStatus, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const CONCURRENCY = 12;

describe("POST /bookings concurrency (BRE-37)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let serviceId: string;
  let availableSlotId: string;
  let bookedSlotId: string;
  let clientIds: string[];

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    const provider = await prisma.user.create({
      data: {
        email: `provider-bre37-${runId}@test.local`,
        name: "BRE-37 Provider",
        role: Role.PROVIDER,
      },
    });
    providerId = provider.id;

    const service = await prisma.service.create({
      data: {
        providerId,
        name: `BRE-37 Service ${runId}`,
        description: "Integration test service for locking PoC",
        durationMinutes: 30,
      },
    });
    serviceId = service.id;

    const startsAt = new Date(Date.UTC(2030, 0, 1, 10, 0, 0));
    const endsAt = new Date(Date.UTC(2030, 0, 1, 10, 30, 0));

    const [availableSlot, bookedSlot] = await Promise.all([
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt,
          endsAt,
          status: SlotStatus.AVAILABLE,
        },
      }),
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt: new Date(Date.UTC(2030, 0, 1, 11, 0, 0)),
          endsAt: new Date(Date.UTC(2030, 0, 1, 11, 30, 0)),
          status: SlotStatus.BOOKED,
        },
      }),
    ]);
    availableSlotId = availableSlot.id;
    bookedSlotId = bookedSlot.id;

    clientIds = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const client = await prisma.user.create({
        data: {
          email: `client-bre37-${runId}-${i}@test.local`,
          name: `BRE-37 Client ${i}`,
          role: Role.CLIENT,
        },
      });
      clientIds.push(client.id);
    }

    // Pre-existing booking on the already-BOOKED slot (realistic non-AVAILABLE case).
    await prisma.booking.create({
      data: {
        slotId: bookedSlotId,
        clientId: clientIds[0]!,
        status: BookingStatus.CONFIRMED,
      },
    });
  });

  after(async () => {
    try {
      const slotIds = [availableSlotId, bookedSlotId].filter(Boolean);
      if (slotIds.length > 0) {
        const bookings = await prisma.booking.findMany({
          where: { slotId: { in: slotIds } },
          select: { id: true },
        });
        const bookingIds = bookings.map((b) => b.id);
        if (bookingIds.length > 0) {
          await prisma.notificationJob.deleteMany({
            where: { bookingId: { in: bookingIds } },
          });
          await prisma.booking.deleteMany({
            where: { id: { in: bookingIds } },
          });
        }
        await prisma.timeSlot.deleteMany({ where: { id: { in: slotIds } } });
      }
      if (serviceId) {
        await prisma.service.deleteMany({ where: { id: serviceId } });
      }
      const userIds = [providerId, ...(clientIds ?? [])].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  it("allows exactly one winner among concurrent bookings for the same slot", async () => {
    const responses = await Promise.all(
      clientIds.map((clientId) =>
        app.inject({
          method: "POST",
          url: "/bookings",
          payload: { slotId: availableSlotId, clientId },
        }),
      ),
    );

    const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
      acc[res.statusCode] = (acc[res.statusCode] ?? 0) + 1;
      return acc;
    }, {});

    assert.equal(
      statusCounts[201],
      1,
      `expected exactly one 201, got ${JSON.stringify(statusCounts)}`,
    );
    assert.equal(
      statusCounts[409],
      CONCURRENCY - 1,
      `expected ${CONCURRENCY - 1}×409, got ${JSON.stringify(statusCounts)}`,
    );

    for (const res of responses) {
      if (res.statusCode === 409) {
        const body = res.json() as {
          error: { code: string; details?: { slotId?: string } };
        };
        assert.equal(body.error.code, ErrorCode.SLOT_UNAVAILABLE);
        assert.equal(body.error.details?.slotId, availableSlotId);
      }
    }

    const slot = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: availableSlotId },
    });
    assert.equal(slot.status, SlotStatus.BOOKED);

    const bookings = await prisma.booking.findMany({
      where: { slotId: availableSlotId },
    });
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0]!.status, BookingStatus.CONFIRMED);
    assert.ok(clientIds.includes(bookings[0]!.clientId));
  });

  it("returns 409 for a missing slot and does not insert a booking", async () => {
    const missingSlotId = randomUUID();
    const beforeCount = await prisma.booking.count();

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: missingSlotId, clientId: clientIds[0]! },
    });

    assert.equal(res.statusCode, 409);
    const body = res.json() as { error: { code: string } };
    assert.equal(body.error.code, ErrorCode.SLOT_UNAVAILABLE);

    const afterCount = await prisma.booking.count();
    assert.equal(afterCount, beforeCount);
  });

  it("returns 409 for a non-AVAILABLE slot and does not insert a booking", async () => {
    const beforeCount = await prisma.booking.count({
      where: { slotId: bookedSlotId },
    });
    assert.equal(beforeCount, 1);

    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: bookedSlotId, clientId: clientIds[1]! },
    });

    assert.equal(res.statusCode, 409);
    const body = res.json() as { error: { code: string } };
    assert.equal(body.error.code, ErrorCode.SLOT_UNAVAILABLE);

    const afterCount = await prisma.booking.count({
      where: { slotId: bookedSlotId },
    });
    assert.equal(afterCount, 1);

    const slot = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: bookedSlotId },
    });
    assert.equal(slot.status, SlotStatus.BOOKED);
  });
});
