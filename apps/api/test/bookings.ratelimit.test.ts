import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Role, SlotStatus, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { authHeader } from "./auth-header.js";

const LIMIT = 3;

describe("POST /bookings rate limit (BRE-92)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let clientIds: string[];
  let serviceId: string;
  let slotId: string;
  let freeSlotId: string;
  const previousEnv = {
    max: process.env.BOOKING_RATE_LIMIT_MAX,
    window: process.env.BOOKING_RATE_LIMIT_WINDOW,
  };

  const book = (headers: Record<string, string> | undefined, slot = slotId) =>
    app.inject({ method: "POST", url: "/bookings", headers, payload: { slotId: slot } });

  before(async () => {
    runId = randomUUID();
    process.env.BOOKING_RATE_LIMIT_MAX = String(LIMIT);
    process.env.BOOKING_RATE_LIMIT_WINDOW = "60000";
    app = await buildApp({ logger: false });

    const provider = await prisma.user.create({
      data: {
        email: `provider-bre92-${runId}@test.local`,
        name: "BRE-92 Provider",
        role: Role.PROVIDER,
      },
    });
    providerId = provider.id;

    const clients = await Promise.all(
      [1, 2].map((n) =>
        prisma.user.create({
          data: {
            email: `client${n}-bre92-${runId}@test.local`,
            name: `BRE-92 Client ${n}`,
            role: Role.CLIENT,
          },
        }),
      ),
    );
    clientIds = clients.map((c) => c.id);

    const service = await prisma.service.create({
      data: {
        providerId,
        name: `BRE-92 Service ${runId}`,
        description: "Rate limit test service",
        durationMinutes: 30,
      },
    });
    serviceId = service.id;

    const [slot, freeSlot] = await Promise.all(
      [10, 11].map((hour) =>
        prisma.timeSlot.create({
          data: {
            serviceId,
            startsAt: new Date(Date.UTC(2034, 0, 1, hour, 0, 0)),
            endsAt: new Date(Date.UTC(2034, 0, 1, hour, 30, 0)),
            status: SlotStatus.AVAILABLE,
          },
        }),
      ),
    );
    slotId = slot.id;
    freeSlotId = freeSlot.id;
  });

  after(async () => {
    for (const [name, value] of [
      ["BOOKING_RATE_LIMIT_MAX", previousEnv.max],
      ["BOOKING_RATE_LIMIT_WINDOW", previousEnv.window],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }

    try {
      const slotIds = [slotId, freeSlotId].filter(Boolean);
      const bookings = await prisma.booking.findMany({
        where: { slotId: { in: slotIds } },
        select: { id: true },
      });
      const bookingIds = bookings.map((b) => b.id);
      await prisma.notificationJob.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await prisma.timeSlot.deleteMany({ where: { id: { in: slotIds } } });
      if (serviceId) await prisma.service.deleteMany({ where: { id: serviceId } });
      await prisma.user.deleteMany({
        where: { id: { in: [providerId, ...(clientIds ?? [])].filter(Boolean) } },
      });
    } finally {
      await app.close();
    }
  });

  it("returns 429 RATE_LIMITED per client after the limit, keeping 201 and 409 below it", async () => {
    const asClient1 = authHeader(app, clientIds[0]!, Role.CLIENT);

    const first = await book(asClient1);
    assert.equal(first.statusCode, 201);

    // Still below the limit: the slot is taken, so the conflict answer is unchanged.
    for (let i = 1; i < LIMIT; i++) {
      const conflict = await book(asClient1);
      assert.equal(conflict.statusCode, 409);
      assert.equal(conflict.json().error.code, ErrorCode.SLOT_UNAVAILABLE);
    }

    const limited = await book(asClient1, freeSlotId);
    assert.equal(limited.statusCode, 429);
    assert.ok(Number(limited.headers["retry-after"]) > 0);
    const body = limited.json();
    assert.equal(body.error.code, ErrorCode.RATE_LIMITED);
    assert.match(body.error.message, /Too many booking requests/);
    assert.deepEqual(Object.keys(body), ["error"]);

    const freeSlot = await prisma.timeSlot.findUniqueOrThrow({ where: { id: freeSlotId } });
    assert.equal(freeSlot.status, SlotStatus.AVAILABLE);

    // The bucket is per client, not global.
    const other = await book(authHeader(app, clientIds[1]!, Role.CLIENT), freeSlotId);
    assert.equal(other.statusCode, 201);
  });

  it("does not spend the bucket on 401/403 responses and leaves reads unlimited", async () => {
    for (let i = 0; i < LIMIT + 2; i++) {
      const anonymous = await book(undefined);
      assert.equal(anonymous.statusCode, 401);
      assert.equal(anonymous.json().error.code, ErrorCode.UNAUTHORIZED);

      const asProvider = await book(authHeader(app, providerId, Role.PROVIDER));
      assert.equal(asProvider.statusCode, 403);
      assert.equal(asProvider.json().error.code, ErrorCode.FORBIDDEN);

      const list = await app.inject({
        method: "GET",
        url: "/bookings",
        headers: authHeader(app, providerId, Role.PROVIDER),
      });
      assert.equal(list.statusCode, 200);

      const health = await app.inject({ method: "GET", url: "/health" });
      assert.equal(health.statusCode, 200);
    }
  });

  it("refuses to start with an invalid limit instead of disabling it", async () => {
    process.env.BOOKING_RATE_LIMIT_MAX = "0";
    await assert.rejects(
      buildApp({ logger: false }),
      /BOOKING_RATE_LIMIT_MAX must be a positive integer/,
    );
    process.env.BOOKING_RATE_LIMIT_MAX = String(LIMIT);

    process.env.BOOKING_RATE_LIMIT_WINDOW = "1 minute";
    await assert.rejects(
      buildApp({ logger: false }),
      /BOOKING_RATE_LIMIT_WINDOW must be a positive integer/,
    );
    process.env.BOOKING_RATE_LIMIT_WINDOW = "60000";
  });
});
