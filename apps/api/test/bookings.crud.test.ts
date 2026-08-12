import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  BookingStatus,
  NotificationStatus,
  NotificationType,
  Role,
  SlotStatus,
  prisma,
} from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("Booking API CRUD (BRE-41)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let serviceId: string;
  let slotId: string;
  let conflictSlotId: string;
  let clientId: string;
  let otherClientId: string;

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    const provider = await prisma.user.create({
      data: {
        email: `provider-bre41-${runId}@test.local`,
        name: "BRE-41 Provider",
        role: Role.PROVIDER,
      },
    });
    providerId = provider.id;

    const service = await prisma.service.create({
      data: {
        providerId,
        name: `BRE-41 Service ${runId}`,
        description: "Integration test service for booking CRUD",
        durationMinutes: 30,
      },
    });
    serviceId = service.id;

    const [slot, conflictSlot] = await Promise.all([
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt: new Date(Date.UTC(2031, 0, 1, 10, 0, 0)),
          endsAt: new Date(Date.UTC(2031, 0, 1, 10, 30, 0)),
          status: SlotStatus.AVAILABLE,
        },
      }),
      prisma.timeSlot.create({
        data: {
          serviceId,
          startsAt: new Date(Date.UTC(2031, 0, 1, 11, 0, 0)),
          endsAt: new Date(Date.UTC(2031, 0, 1, 11, 30, 0)),
          status: SlotStatus.AVAILABLE,
        },
      }),
    ]);
    slotId = slot.id;
    conflictSlotId = conflictSlot.id;

    const [client, otherClient] = await Promise.all([
      prisma.user.create({
        data: {
          email: `client-bre41-${runId}@test.local`,
          name: "BRE-41 Client",
          role: Role.CLIENT,
        },
      }),
      prisma.user.create({
        data: {
          email: `client-bre41-other-${runId}@test.local`,
          name: "BRE-41 Other Client",
          role: Role.CLIENT,
        },
      }),
    ]);
    clientId = client.id;
    otherClientId = otherClient.id;
  });

  after(async () => {
    try {
      const slotIds = [slotId, conflictSlotId].filter(Boolean);
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
      const userIds = [providerId, clientId, otherClientId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  it("happy path: create → get → list → cancel frees slot", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId, clientId },
    });
    assert.equal(createRes.statusCode, 201);
    const created = createRes.json() as {
      id: string;
      status: string;
      slotId: string;
      clientId: string;
    };
    assert.equal(created.status, BookingStatus.CONFIRMED);
    assert.equal(created.slotId, slotId);
    assert.equal(created.clientId, clientId);

    const notificationJobs = await prisma.notificationJob.findMany({
      where: { bookingId: created.id },
    });
    assert.equal(notificationJobs.length, 1);
    assert.equal(notificationJobs[0]!.type, NotificationType.CONFIRMATION);
    assert.equal(notificationJobs[0]!.status, NotificationStatus.PENDING);

    const getRes = await app.inject({
      method: "GET",
      url: `/bookings/${created.id}`,
    });
    assert.equal(getRes.statusCode, 200);
    const fetched = getRes.json() as {
      id: string;
      slot: { id: string; service: { name: string } };
      client: { id: string };
    };
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.slot.id, slotId);
    assert.equal(fetched.client.id, clientId);
    assert.ok(fetched.slot.service.name.includes("BRE-41 Service"));

    const listRes = await app.inject({
      method: "GET",
      url: `/bookings?clientId=${clientId}`,
    });
    assert.equal(listRes.statusCode, 200);
    const list = listRes.json() as Array<{ id: string }>;
    assert.ok(list.some((b) => b.id === created.id));

    const cancelRes = await app.inject({
      method: "DELETE",
      url: `/bookings/${created.id}`,
    });
    assert.equal(cancelRes.statusCode, 200);
    const cancelled = cancelRes.json() as {
      id: string;
      status: string;
      cancelledAt: string | null;
    };
    assert.equal(cancelled.status, BookingStatus.CANCELLED);
    assert.ok(cancelled.cancelledAt);

    const slot = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: slotId },
    });
    assert.equal(slot.status, SlotStatus.AVAILABLE);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.equal(booking.status, BookingStatus.CANCELLED);
    assert.ok(booking.cancelledAt);

    // Second cancel → 404 (already cancelled)
    const secondCancel = await app.inject({
      method: "DELETE",
      url: `/bookings/${created.id}`,
    });
    assert.equal(secondCancel.statusCode, 404);
    const secondBody = secondCancel.json() as {
      error: { code: string; message: string };
    };
    assert.equal(secondBody.error.code, ErrorCode.NOT_FOUND);
    assert.match(secondBody.error.message, /already cancelled/i);
  });

  it("returns 409 SLOT_UNAVAILABLE when booking an already taken slot", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: conflictSlotId, clientId },
    });
    assert.equal(first.statusCode, 201);

    const second = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: conflictSlotId, clientId: otherClientId },
    });
    assert.equal(second.statusCode, 409);
    const body = second.json() as {
      error: { code: string; details?: { slotId?: string } };
    };
    assert.equal(body.error.code, ErrorCode.SLOT_UNAVAILABLE);
    assert.equal(body.error.details?.slotId, conflictSlotId);
  });

  it("returns 404 envelope for unknown booking id on GET and DELETE", async () => {
    const missingId = randomUUID();

    const getRes = await app.inject({
      method: "GET",
      url: `/bookings/${missingId}`,
    });
    assert.equal(getRes.statusCode, 404);
    const getBody = getRes.json() as { error: { code: string } };
    assert.equal(getBody.error.code, ErrorCode.NOT_FOUND);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/bookings/${missingId}`,
    });
    assert.equal(deleteRes.statusCode, 404);
    const deleteBody = deleteRes.json() as { error: { code: string } };
    assert.equal(deleteBody.error.code, ErrorCode.NOT_FOUND);
  });

  it("returns 422 envelope for invalid body and params", async () => {
    const badBody = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotId: "not-a-uuid", clientId },
    });
    assert.equal(badBody.statusCode, 422);
    const bodyErr = badBody.json() as { error: { code: string } };
    assert.equal(bodyErr.error.code, ErrorCode.VALIDATION_ERROR);

    const badParam = await app.inject({
      method: "GET",
      url: "/bookings/not-a-uuid",
    });
    assert.equal(badParam.statusCode, 422);
    const paramErr = badParam.json() as { error: { code: string } };
    assert.equal(paramErr.error.code, ErrorCode.VALIDATION_ERROR);

    const badQuery = await app.inject({
      method: "GET",
      url: "/bookings?clientId=not-a-uuid",
    });
    assert.equal(badQuery.statusCode, 422);
    const queryErr = badQuery.json() as { error: { code: string } };
    assert.equal(queryErr.error.code, ErrorCode.VALIDATION_ERROR);
  });
});
