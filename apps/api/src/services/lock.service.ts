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
}
