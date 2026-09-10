import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Role, SlotStatus, prisma } from "@repo/database";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const CONCURRENCY = 10;
const START_DATE = "2032-06-01";
const END_DATE = "2032-06-02";
const WINDOW_START = "09:00";
const WINDOW_END = "13:00";
/** 09:00–13:00 in 30-minute steps, twice (two UTC days). */
const EXPECTED_SLOTS = 16;

describe("POST /slots/generate concurrency (BRE-77)", () => {
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let serviceId: string;

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    const provider = await prisma.user.create({
      data: {
        email: `provider-bre77-conc-${runId}@test.local`,
        name: "BRE-77 Concurrency Provider",
        role: Role.PROVIDER,
      },
    });
    providerId = provider.id;

    const service = await prisma.service.create({
      data: {
        providerId,
        name: `BRE-77 Concurrency Service ${runId}`,
        description: "Integration test service for advisory-lock slot generation",
        durationMinutes: 30,
      },
    });
    serviceId = service.id;
  });

  after(async () => {
    try {
      if (serviceId) {
        await prisma.timeSlot.deleteMany({ where: { serviceId } });
        await prisma.service.deleteMany({ where: { id: serviceId } });
      }
      if (providerId) {
        await prisma.user.deleteMany({ where: { id: providerId } });
      }
    } finally {
      await app.close();
    }
  });

  it("creates each slot exactly once under parallel generate requests", async () => {
    const payload = {
      serviceId,
      startDate: START_DATE,
      endDate: END_DATE,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    };

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        app.inject({ method: "POST", url: "/slots/generate", payload }),
      ),
    );

    const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
      acc[res.statusCode] = (acc[res.statusCode] ?? 0) + 1;
      return acc;
    }, {});
    assert.equal(
      statusCounts[201],
      CONCURRENCY,
      `expected ${CONCURRENCY}×201, got ${JSON.stringify(statusCounts)}`,
    );

    for (const res of responses) {
      const slots = res.json() as Array<{ id: string; status: string }>;
      assert.equal(slots.length, EXPECTED_SLOTS);
    }

    const stored = await prisma.timeSlot.findMany({
      where: { serviceId },
      orderBy: { startsAt: "asc" },
    });
    assert.equal(stored.length, EXPECTED_SLOTS);
    assert.ok(stored.every((slot) => slot.status === SlotStatus.AVAILABLE));

    // The advisory lock proof: no two rows for this service share a start time
    // and no two intervals overlap.
    const starts = stored.map((slot) => slot.startsAt.toISOString());
    assert.equal(new Set(starts).size, starts.length);

    for (let i = 1; i < stored.length; i++) {
      assert.ok(
        stored[i - 1]!.endsAt.getTime() <= stored[i]!.startsAt.getTime(),
        `slots ${stored[i - 1]!.id} and ${stored[i]!.id} overlap`,
      );
    }
  });
});
