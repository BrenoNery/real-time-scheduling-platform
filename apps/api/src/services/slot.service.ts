import { Prisma, type PrismaClient } from "@repo/database";
import {
  NotFoundError,
  SlotNotMutableError,
  clockTimeToMinutes,
  parseCalendarDate,
  type GenerateSlotsBody,
  type ListSlotsQuery,
  type UpdateSlotBody,
} from "@repo/shared";
import { LockService } from "./lock.service.js";

const slotInclude = {
  service: true,
} as const;

type SlotWithService = Prisma.TimeSlotGetPayload<{
  include: typeof slotInclude;
}>;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Generating one day can block on the advisory lock while a concurrent request
 * finishes, so the interactive transaction gets more headroom than Prisma's
 * 5s/2s defaults.
 */
const GENERATE_TX_OPTIONS = { timeout: 20_000, maxWait: 20_000 } as const;

type CandidateSlot = { startsAt: Date; endsAt: Date };

/** Inclusive list of UTC calendar dates (`YYYY-MM-DD`) between two dates. */
function utcDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = parseCalendarDate(endDate).getTime();

  for (let cursor = parseCalendarDate(startDate).getTime(); cursor <= end; cursor += DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Fill `[windowStart, windowEnd)` with back-to-back intervals of `durationMinutes`.
 * A trailing gap shorter than the duration is dropped rather than shortened.
 */
function buildCandidates(
  date: string,
  windowStart: string,
  windowEnd: string,
  durationMinutes: number,
): CandidateSlot[] {
  const dayStart = parseCalendarDate(date).getTime();
  const windowEndMs = dayStart + clockTimeToMinutes(windowEnd) * MINUTE_MS;
  const stepMs = durationMinutes * MINUTE_MS;

  const candidates: CandidateSlot[] = [];
  let cursor = dayStart + clockTimeToMinutes(windowStart) * MINUTE_MS;

  while (cursor + stepMs <= windowEndMs) {
    candidates.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + stepMs) });
    cursor += stepMs;
  }

  return candidates;
}

function overlaps(a: CandidateSlot, b: { startsAt: Date; endsAt: Date }): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

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
   */
  async generateSlots(body: GenerateSlotsBody): Promise<SlotWithService[]> {
    const { serviceId, startDate, endDate, windowStart, windowEnd } = body;

    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundError("Service", serviceId);
    }

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
          await tx.timeSlot.createMany({
            data: missing.map((candidate) => ({
              serviceId,
              startsAt: candidate.startsAt,
              endsAt: candidate.endsAt,
              status: "AVAILABLE" as const,
            })),
          });
        }
      }, GENERATE_TX_OPTIONS);
    }

    if (windows.length === 0) {
      return [];
    }

    return this.prisma.timeSlot.findMany({
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
