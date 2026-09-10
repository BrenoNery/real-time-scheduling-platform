import { SlotUnavailableError } from "@repo/shared";
import type { PrismaClient } from "@repo/database";

/** Prisma interactive transaction client (supports $queryRaw). */
export type DbTransaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Raw `time_slots` columns selected by acquireSlotLock (@@map names). */
export type LockedSlotRow = {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
};

export class LockService {
  /**
   * Pessimistically lock an AVAILABLE time slot row for the duration of `tx`.
   * Concurrent transactions block on FOR UPDATE until this one commits/rolls back.
   */
  async acquireSlotLock(tx: DbTransaction, slotId: string): Promise<LockedSlotRow> {
    const rows = await tx.$queryRaw<LockedSlotRow[]>`
      SELECT id, status, starts_at, ends_at
      FROM time_slots
      WHERE id = ${slotId}::uuid AND status = 'AVAILABLE'
      FOR UPDATE
    `;

    const slot = rows[0];
    if (!slot) {
      throw new SlotUnavailableError(slotId);
    }

    return slot;
  }

  /**
   * Lock an existing slot row regardless of status, for transitions that must read
   * the current status before deciding (block/unblock). Returns null when missing.
   */
  async acquireSlotRowLock(tx: DbTransaction, slotId: string): Promise<LockedSlotRow | null> {
    const rows = await tx.$queryRaw<LockedSlotRow[]>`
      SELECT id, status, starts_at, ends_at
      FROM time_slots
      WHERE id = ${slotId}::uuid
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  /**
   * Serialize bulk slot generation for one service on one UTC calendar date.
   * The advisory lock is transaction-scoped, so PostgreSQL releases it on
   * COMMIT/ROLLBACK; it must be taken before reading or inserting that day's slots.
   */
  async acquireSlotRangeLock(tx: DbTransaction, serviceId: string, date: string): Promise<void> {
    const key = `slot-range:${serviceId}:${date}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
