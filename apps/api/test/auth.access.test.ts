import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { BookingStatus, Role, SlotStatus, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { authHeader } from "./auth-header.js";

describe("Provider and Client access control (BRE-91)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let clientId: string;
  let serviceId: string;
  let slotId: string;
  let asProvider: { authorization: string };
  let asClient: { authorization: string };

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    const [provider, client] = await Promise.all([
      prisma.user.create({
        data: {
          email: `provider-bre91-${runId}@test.local`,
          name: "BRE-91 Provider",
          role: Role.PROVIDER,
        },
      }),
      prisma.user.create({
        data: {
          email: `client-bre91-${runId}@test.local`,
          name: "BRE-91 Client",
          role: Role.CLIENT,
        },
      }),
    ]);
    providerId = provider.id;
    clientId = client.id;
    asProvider = authHeader(app, providerId, Role.PROVIDER);
    asClient = authHeader(app, clientId, Role.CLIENT);

    const service = await prisma.service.create({
      data: {
        providerId,
        name: `BRE-91 Service ${runId}`,
        description: "Access control test service",
        durationMinutes: 30,
      },
    });
    serviceId = service.id;

    const slot = await prisma.timeSlot.create({
      data: {
        serviceId,
        startsAt: new Date(Date.UTC(2033, 0, 1, 10, 0, 0)),
        endsAt: new Date(Date.UTC(2033, 0, 1, 10, 30, 0)),
        status: SlotStatus.AVAILABLE,
      },
    });
    slotId = slot.id;
  });

  after(async () => {
    try {
      if (slotId) {
        const bookings = await prisma.booking.findMany({ where: { slotId }, select: { id: true } });
        const bookingIds = bookings.map((b) => b.id);
        await prisma.notificationJob.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await prisma.timeSlot.deleteMany({ where: { id: slotId } });
      }
      if (serviceId) {
        await prisma.service.deleteMany({ where: { id: serviceId } });
      }
      const userIds = [providerId, clientId].filter(Boolean);
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await app.close();
    }
  });

  const providerRoutes = () => [
    {
      method: "POST" as const,
      url: "/slots/generate",
      payload: { serviceId, startDate: "2033-01-02", endDate: "2033-01-02" },
    },
    { method: "PATCH" as const, url: `/slots/${slotId}`, payload: { status: "BLOCKED" } },
    { method: "GET" as const, url: "/bookings" },
    { method: "GET" as const, url: `/bookings/${randomUUID()}` },
    { method: "DELETE" as const, url: `/bookings/${randomUUID()}` },
  ];

  function assertError(
    res: { statusCode: number; json: () => unknown },
    status: number,
    code: string,
  ) {
    assert.equal(res.statusCode, status);
    assert.equal((res.json() as { error: { code: string } }).error.code, code);
  }

  it("protected routes return 401 UNAUTHORIZED without a valid token", async () => {
    const expired = app.jwt.sign({ sub: clientId, role: Role.CLIENT }, { expiresIn: -60 });
    const badHeaders = [
      undefined,
      { authorization: "Bearer not-a-jwt" },
      { authorization: `Bearer ${asClient.authorization.slice(7, -2)}xx` },
      { authorization: `Bearer ${expired}` },
    ];

    for (const route of [
      ...providerRoutes(),
      { method: "POST" as const, url: "/bookings", payload: { slotId } },
    ]) {
      for (const headers of badHeaders) {
        const res = await app.inject({ ...route, headers });
        assertError(res, 401, ErrorCode.UNAUTHORIZED);
      }
    }

    const slot = await prisma.timeSlot.findUniqueOrThrow({ where: { id: slotId } });
    assert.equal(slot.status, SlotStatus.AVAILABLE);
  });

  it("a client token gets 403 FORBIDDEN on provider routes", async () => {
    for (const route of providerRoutes()) {
      const res = await app.inject({ ...route, headers: asClient });
      assertError(res, 403, ErrorCode.FORBIDDEN);
    }

    const slot = await prisma.timeSlot.findUniqueOrThrow({ where: { id: slotId } });
    assert.equal(slot.status, SlotStatus.AVAILABLE);
  });

  it("a provider token gets 403 FORBIDDEN on POST /bookings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: asProvider,
      payload: { slotId },
    });
    assertError(res, 403, ErrorCode.FORBIDDEN);
    assert.equal(await prisma.booking.count({ where: { slotId } }), 0);
  });

  it("rejects a clientId in the booking body with 422 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: asClient,
      payload: { slotId, clientId: randomUUID() },
    });
    assertError(res, 422, ErrorCode.VALIDATION_ERROR);
    assert.equal(await prisma.booking.count({ where: { slotId } }), 0);
  });

  it("a client books for itself: the booking client is the token subject", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: asClient,
      payload: { slotId },
    });
    assert.equal(res.statusCode, 201);
    const booking = res.json() as { clientId: string; status: string };
    assert.equal(booking.clientId, clientId);
    assert.equal(booking.status, BookingStatus.CONFIRMED);
  });

  it("public routes stay open without a token", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);

    const slots = await app.inject({ method: "GET", url: `/slots?serviceId=${serviceId}` });
    assert.equal(slots.statusCode, 200);
  });
});
