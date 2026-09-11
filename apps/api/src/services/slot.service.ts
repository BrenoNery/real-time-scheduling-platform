import { Prisma, type PrismaClient } from "@repo/database";
import {
  NotFoundError,
  SlotNotMutableError,
  type GenerateSlotsBody,
  type GenerateSlotsResponse,
  type ListSlotsQuery,
  type UpdateSlotBody,
} from "@repo/shared";
import { LockService } from "./lock.service.js";
import { buildCandidates, overlaps, utcDateRange } from "./slot-window.js";

const slotInclude = {
  service: true,
} as const;

type SlotWithService = Prisma.TimeSlotGetPayload<{
  include: typeof slotInclude;
}>;

/**
 * Generating one day can block on the advisory lock while a concurrent request
 * finishes, so the interactive transaction gets more headroom than Prisma's
 * 5s/2s defaults.
 */
const GENERATE_TX_OPTIONS = { timeout: 20_000, maxWait: 20_000 } as const;

export class SlotService {
  private readonly lockService: LockService;

  constructor(private readonly prisma: PrismaClient) {
    this.lockService = new LockService();
  }

  /**
   * Unlocked read (Read Committed), matching the dashboard-read guidance in
   * ARCHITECTURE.md §5.
   */
  async listSlots(query: ListSlotsQuery = {}): Promise<SlotWithService[]> {
    const startsAtFilter = {
      ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { lt: new Date(query.to) } : {}),
    };

    return this.prisma.timeSlot.findMany({
      where: {
        ...(query.serviceId !== undefined ? { serviceId: query.serviceId } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(Object.keys(startsAtFilter).length > 0 ? { startsAt: startsAtFilter } : {}),
      },
      include: slotInclude,
      orderBy: { startsAt: "asc" },
    });
  }

  /**
   * Create the missing slots of a daily window across a UTC date range. Each day is
   * generated in its own transaction guarded by `pg_advisory_xact_lock`, so parallel
   * requests for the same service and date cannot insert overlapping slots. Existing
   * rows always win, which makes the operation idempotent, and new rows are AVAILABLE.
   *
   * `created` is this request's inserts; `slots` is the full overlapping window
   * (including BOOKED/BLOCKED).
   */
  async generateSlots(body: GenerateSlotsBody): Promise<GenerateSlotsResponse<SlotWithService>> {
    const { serviceId, startDate, endDate, windowStart, windowEnd } = body;

    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundError("Service", serviceId);
    }

    const createdIds: string[] = [];
    const windows: Array<{ from: Date; to: Date }> = [];

    for (const date of utcDateRange(startDate, endDate)) {
      const candidates = buildCandidates(date, windowStart, windowEnd, service.durationMinutes);
      if (candidates.length === 0) {
        continue;
      }

      const windowFrom = candidates[0]!.startsAt;
      const windowTo = candidates[candidates.length - 1]!.endsAt;
      windows.push({ from: windowFrom, to: windowTo });

      await this.prisma.$transaction(async (tx) => {
        await this.lockService.acquireSlotRangeLock(tx, serviceId, date);

        const existing = await tx.timeSlot.findMany({
          where: {
            serviceId,
            startsAt: { lt: windowTo },
            endsAt: { gt: windowFrom },
          },
          select: { startsAt: true, endsAt: true },
        });

        const missing = candidates.filter(
          (candidate) => !existing.some((slot) => overlaps(candidate, slot)),
        );

        if (missing.length > 0) {
          const inserted = await tx.timeSlot.createManyAndReturn({
            data: missing.map((candidate) => ({
              serviceId,
              startsAt: candidate.startsAt,
              endsAt: candidate.endsAt,
              status: "AVAILABLE" as const,
            })),
            select: { id: true },
          });
          createdIds.push(...inserted.map((row) => row.id));
        }
      }, GENERATE_TX_OPTIONS);
    }

    if (windows.length === 0) {
      return { created: [], slots: [] };
    }

    const slots = await this.prisma.timeSlot.findMany({
      where: {
        serviceId,
        OR: windows.map((window) => ({
          startsAt: { lt: window.to },
          endsAt: { gt: window.from },
        })),
      },
      include: slotInclude,
      orderBy: { startsAt: "asc" },
    });

    const createdIdSet = new Set(createdIds);
    const created = slots.filter((slot) => createdIdSet.has(slot.id));

    return { created, slots };
  }

  /**
   * Block or unblock a slot. The row is locked FOR UPDATE so a concurrent booking
   * either commits first (and this call sees BOOKED) or waits for this transaction.
   * BOOKED is reachable only through POST /bookings.
   */
  async updateSlotStatus(id: string, { status }: UpdateSlotBody): Promise<SlotWithService> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockService.acquireSlotRowLock(tx, id);

      if (!locked) {
        throw new NotFoundError("Slot", id);
      }

      if (locked.status !== "AVAILABLE" && locked.status !== "BLOCKED") {
        throw new SlotNotMutableError(id, locked.status);
      }

      return tx.timeSlot.update({
        where: { id },
        data: { status },
        include: slotInclude,
      });
    });
  }
}
