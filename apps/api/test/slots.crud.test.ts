import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { BookingStatus, Role, SlotStatus, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

/** Far-future UTC dates so fixtures never collide with the seed data. */
const GENERATE_DATE = "2032-03-01";
const PATCH_DAY = Date.UTC(2032, 2, 2);
const LIST_DAY_ONE = Date.UTC(2032, 2, 5);
const LIST_DAY_TWO = Date.UTC(2032, 2, 6);
const HOUR_MS = 3_600_000;

type SlotResponse = {
  id: string;
  serviceId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  service: { id: string; name: string };
};

describe("Slot API CRUD (BRE-77)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let serviceId: string;
  let listServiceId: string;
  let clientId: string;
  let patchSlotId: string;
  let bookedSlotId: string;

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    const provider = await prisma.user.create({
      data: {
        email: `provider-bre77-${runId}@test.local`,
        name: "BRE-77 Provider",
        role: Role.PROVIDER,
      },
    });
    providerId = provider.id;

    const [service, listService] = await Promise.all([
      prisma.service.create({
        data: {
          providerId,
          name: `BRE-77 Service ${runId}`,
          description: "Integration test service for slot generation",
          durationMinutes: 30,
        },
      }),
      prisma.service.create({
        data: {
          providerId,
          name: `BRE-77 List Service ${runId}`,
          description: "Integration test service for slot listing filters",
          durationMinutes: 60,
        },
      }),
    ]);
    serviceId = service.id;
    listServiceId = listService.id;

    const client = await prisma.user.create({
      data: {
        email: `client-bre77-${runId}@test.local`,
        name: "BRE-77 Client",
        role: Role.CLIENT,
      },
    });
    clientId = client.id;

    // List fixtures: one slot per status, spread over two UTC days.
    await prisma.timeSlot.createMany({
      data: [
        {
          serviceId: listServiceId,
          startsAt: new Date(LIST_DAY_ONE + 9 * HOUR_MS),
          endsAt: new Date(LIST_DAY_ONE + 10 * HOUR_MS),
          status: SlotStatus.AVAILABLE,
        },
        {
          serviceId: listServiceId,
          startsAt: new Date(LIST_DAY_ONE + 10 * HOUR_MS),
          endsAt: new Date(LIST_DAY_ONE + 11 * HOUR_MS),
          status: SlotStatus.BOOKED,
        },
        {
          serviceId: listServiceId,
          startsAt: new Date(LIST_DAY_TWO + 9 * HOUR_MS),
          endsAt: new Date(LIST_DAY_TWO + 10 * HOUR_MS),
          status: SlotStatus.BLOCKED,
        },
      ],
    });

    // PATCH fixtures live outside the generation window so the two never interact.
    const [patchSlot, bookedSlot] = await Promise.all([
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt: new Date(PATCH_DAY + 14 * HOUR_MS),
          endsAt: new Date(PATCH_DAY + 14.5 * HOUR_MS),
          status: SlotStatus.AVAILABLE,
        },
      }),
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt: new Date(PATCH_DAY + 15 * HOUR_MS),
          endsAt: new Date(PATCH_DAY + 15.5 * HOUR_MS),
          status: SlotStatus.BOOKED,
        },
      }),
    ]);
    patchSlotId = patchSlot.id;
    bookedSlotId = bookedSlot.id;

    await prisma.booking.create({
      data: {
        slotId: bookedSlotId,
        clientId,
        status: BookingStatus.CONFIRMED,
      },
    });
  });

  after(async () => {
    try {
      const serviceIds = [serviceId, listServiceId].filter(Boolean);
      if (serviceIds.length > 0) {
        const slots = await prisma.timeSlot.findMany({
          where: { serviceId: { in: serviceIds } },
          select: { id: true },
        });
        const slotIds = slots.map((slot) => slot.id);
        if (slotIds.length > 0) {
          const bookings = await prisma.booking.findMany({
            where: { slotId: { in: slotIds } },
            select: { id: true },
          });
          const bookingIds = bookings.map((booking) => booking.id);
          if (bookingIds.length > 0) {
            await prisma.notificationJob.deleteMany({
              where: { bookingId: { in: bookingIds } },
            });
            await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
          }
          await prisma.timeSlot.deleteMany({ where: { id: { in: slotIds } } });
        }
        await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      }
      const userIds = [providerId, clientId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  it("lists slots filtered by serviceId, status and date range", async () => {
    const byService = await app.inject({
      method: "GET",
      url: `/slots?serviceId=${listServiceId}`,
    });
    assert.equal(byService.statusCode, 200);
    const all = byService.json() as SlotResponse[];
    assert.equal(all.length, 3);
    assert.ok(all.every((slot) => slot.serviceId === listServiceId));
    assert.ok(all[0]!.service.name.includes("BRE-77 List Service"));
    const startTimes = all.map((slot) => new Date(slot.startsAt).getTime());
    assert.deepEqual(
      startTimes,
      [...startTimes].sort((a, b) => a - b),
    );

    const byStatus = await app.inject({
      method: "GET",
      url: `/slots?serviceId=${listServiceId}&status=${SlotStatus.BLOCKED}`,
    });
    assert.equal(byStatus.statusCode, 200);
    const blocked = byStatus.json() as SlotResponse[];
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0]!.status, SlotStatus.BLOCKED);

    const byRange = await app.inject({
      method: "GET",
      url: `/slots?serviceId=${listServiceId}&from=${new Date(LIST_DAY_TWO).toISOString()}&to=${new Date(LIST_DAY_TWO + 24 * HOUR_MS).toISOString()}`,
    });
    assert.equal(byRange.statusCode, 200);
    const ranged = byRange.json() as SlotResponse[];
    assert.equal(ranged.length, 1);
    assert.equal(ranged[0]!.id, blocked[0]!.id);
  });

  it("returns 422 for invalid list queries", async () => {
    const badService = await app.inject({
      method: "GET",
      url: "/slots?serviceId=not-a-uuid",
    });
    assert.equal(badService.statusCode, 422);
    assert.equal(
      (badService.json() as { error: { code: string } }).error.code,
      ErrorCode.VALIDATION_ERROR,
    );

    const badStatus = await app.inject({
      method: "GET",
      url: "/slots?status=UNKNOWN",
    });
    assert.equal(badStatus.statusCode, 422);

    const invertedRange = await app.inject({
      method: "GET",
      url: "/slots?from=2032-03-06T00:00:00.000Z&to=2032-03-05T00:00:00.000Z",
    });
    assert.equal(invertedRange.statusCode, 422);
    assert.equal(
      (invertedRange.json() as { error: { code: string } }).error.code,
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it("generates 6 AVAILABLE slots for a 09:00–12:00 window with 30-minute duration", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/slots/generate",
      payload: {
        serviceId,
        startDate: GENERATE_DATE,
        endDate: GENERATE_DATE,
        windowStart: "09:00",
        windowEnd: "12:00",
      },
    });
    assert.equal(res.statusCode, 201);

    const slots = res.json() as SlotResponse[];
    assert.equal(slots.length, 6);
    assert.ok(slots.every((slot) => slot.status === SlotStatus.AVAILABLE));
    assert.ok(slots.every((slot) => slot.serviceId === serviceId));
    assert.ok(slots.every((slot) => slot.service.id === serviceId));
    assert.deepEqual(
      slots.map((slot) => slot.startsAt),
      [
        "2032-03-01T09:00:00.000Z",
        "2032-03-01T09:30:00.000Z",
        "2032-03-01T10:00:00.000Z",
        "2032-03-01T10:30:00.000Z",
        "2032-03-01T11:00:00.000Z",
        "2032-03-01T11:30:00.000Z",
      ],
    );
    assert.equal(slots[5]!.endsAt, "2032-03-01T12:00:00.000Z");
  });

  it("is idempotent: regenerating the same range creates no duplicates", async () => {
    const payload = {
      serviceId,
      startDate: GENERATE_DATE,
      endDate: GENERATE_DATE,
      windowStart: "09:00",
      windowEnd: "12:00",
    };

    const first = await app.inject({ method: "POST", url: "/slots/generate", payload });
    assert.equal(first.statusCode, 201);
    const firstIds = (first.json() as SlotResponse[]).map((slot) => slot.id).sort();

    const second = await app.inject({ method: "POST", url: "/slots/generate", payload });
    assert.equal(second.statusCode, 201);
    const secondIds = (second.json() as SlotResponse[]).map((slot) => slot.id).sort();

    assert.deepEqual(secondIds, firstIds);

    const stored = await prisma.timeSlot.findMany({
      where: {
        serviceId,
        startsAt: {
          gte: new Date(`${GENERATE_DATE}T09:00:00.000Z`),
          lt: new Date(`${GENERATE_DATE}T12:00:00.000Z`),
        },
      },
    });
    assert.equal(stored.length, 6);
    assert.equal(new Set(stored.map((slot) => slot.startsAt.toISOString())).size, 6);
  });

  it("drops a trailing window remainder shorter than the service duration", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/slots/generate",
      payload: {
        serviceId,
        startDate: "2032-03-03",
        endDate: "2032-03-03",
        windowStart: "09:00",
        windowEnd: "10:20",
      },
    });
    assert.equal(res.statusCode, 201);

    const slots = res.json() as SlotResponse[];
    assert.equal(slots.length, 2);
    assert.equal(slots[1]!.endsAt, "2032-03-03T10:00:00.000Z");
  });

  it("returns 404 for an unknown service and 422 for invalid generate bodies", async () => {
    const missingService = await app.inject({
      method: "POST",
      url: "/slots/generate",
      payload: {
        serviceId: randomUUID(),
        startDate: GENERATE_DATE,
        endDate: GENERATE_DATE,
      },
    });
    assert.equal(missingService.statusCode, 404);
    const missingBody = missingService.json() as {
      error: { code: string; details?: { resource?: string } };
    };
    assert.equal(missingBody.error.code, ErrorCode.NOT_FOUND);
    assert.equal(missingBody.error.details?.resource, "Service");

    const invalidBodies = [
      { serviceId, startDate: "2032-03-05", endDate: "2032-03-01" },
      { serviceId, startDate: "2032-13-01", endDate: "2032-13-01" },
      {
        serviceId,
        startDate: GENERATE_DATE,
        endDate: GENERATE_DATE,
        windowStart: "12:00",
        windowEnd: "09:00",
      },
      { serviceId, startDate: GENERATE_DATE, endDate: GENERATE_DATE, windowStart: "9:00" },
      { serviceId, startDate: "2032-03-01", endDate: "2032-05-01" },
      { serviceId: "not-a-uuid", startDate: GENERATE_DATE, endDate: GENERATE_DATE },
    ];

    for (const payload of invalidBodies) {
      const res = await app.inject({ method: "POST", url: "/slots/generate", payload });
      assert.equal(res.statusCode, 422, `expected 422 for ${JSON.stringify(payload)}`);
      assert.equal(
        (res.json() as { error: { code: string } }).error.code,
        ErrorCode.VALIDATION_ERROR,
      );
    }
  });

  it("blocks a slot, keeps it unbookable, then restores it", async () => {
    const blockRes = await app.inject({
      method: "PATCH",
      url: `/slots/${patchSlotId}`,
      payload: { status: SlotStatus.BLOCKED },
    });
    assert.equal(blockRes.statusCode, 200);
    const blocked = blockRes.json() as SlotResponse;
    assert.equal(blocked.id, patchSlotId);
    assert.equal(blocked.status, SlotStatus.BLOCKED);
    assert.equal(blocked.service.id, serviceId);

    const listRes = await app.inject({
      method: "GET",
      url: `/slots?serviceId=${serviceId}&status=${SlotStatus.BLOCKED}`,
    });
    assert.equal(listRes.statusCode, 200);
    const listed = listRes.json() as SlotResponse[];
    assert.ok(listed.some((slot) => slot.id === patchSlotId));

    const blockedBooking = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: patchSlotId, clientId },
    });
    assert.equal(blockedBooking.statusCode, 409);
    assert.equal(
      (blockedBooking.json() as { error: { code: string } }).error.code,
      ErrorCode.SLOT_UNAVAILABLE,
    );

    const unblockRes = await app.inject({
      method: "PATCH",
      url: `/slots/${patchSlotId}`,
      payload: { status: SlotStatus.AVAILABLE },
    });
    assert.equal(unblockRes.statusCode, 200);
    assert.equal((unblockRes.json() as SlotResponse).status, SlotStatus.AVAILABLE);

    const booking = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: patchSlotId, clientId },
    });
    assert.equal(booking.statusCode, 201);

    const slot = await prisma.timeSlot.findUniqueOrThrow({ where: { id: patchSlotId } });
    assert.equal(slot.status, SlotStatus.BOOKED);
  });

  it("never lets PATCH set BOOKED and refuses to mutate a booked slot", async () => {
    const bookedBody = await app.inject({
      method: "PATCH",
      url: `/slots/${patchSlotId}`,
      payload: { status: SlotStatus.BOOKED },
    });
    assert.equal(bookedBody.statusCode, 422);
    assert.equal(
      (bookedBody.json() as { error: { code: string } }).error.code,
      ErrorCode.VALIDATION_ERROR,
    );

    const alreadyBooked = await app.inject({
      method: "PATCH",
      url: `/slots/${bookedSlotId}`,
      payload: { status: SlotStatus.BLOCKED },
    });
    assert.equal(alreadyBooked.statusCode, 409);
    const conflict = alreadyBooked.json() as {
      error: { code: string; details?: { slotId?: string; status?: string } };
    };
    assert.equal(conflict.error.code, ErrorCode.SLOT_NOT_MUTABLE);
    assert.equal(conflict.error.details?.slotId, bookedSlotId);
    assert.equal(conflict.error.details?.status, SlotStatus.BOOKED);

    const stillBooked = await prisma.timeSlot.findUniqueOrThrow({ where: { id: bookedSlotId } });
    assert.equal(stillBooked.status, SlotStatus.BOOKED);
  });

  it("returns 404 for an unknown slot id and 422 for a malformed one", async () => {
    const missing = await app.inject({
      method: "PATCH",
      url: `/slots/${randomUUID()}`,
      payload: { status: SlotStatus.BLOCKED },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal((missing.json() as { error: { code: string } }).error.code, ErrorCode.NOT_FOUND);

    const malformed = await app.inject({
      method: "PATCH",
      url: "/slots/not-a-uuid",
      payload: { status: SlotStatus.BLOCKED },
    });
    assert.equal(malformed.statusCode, 422);
    assert.equal(
      (malformed.json() as { error: { code: string } }).error.code,
      ErrorCode.VALIDATION_ERROR,
    );
  });
});
