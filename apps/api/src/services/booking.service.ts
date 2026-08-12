import type { PrismaClient } from "@repo/database";
import type { CreateBookingBody } from "@repo/shared";
import { LockService } from "./lock.service.js";

export class BookingService {
  private readonly lockService: LockService;

  constructor(private readonly prisma: PrismaClient) {
    this.lockService = new LockService();
  }

  /**
   * Atomically book a slot: FOR UPDATE lock → mark BOOKED → insert CONFIRMED booking.
   * Any failure aborts the transaction (no orphan BOOKED slot or booking).
   */
  async createBooking({ slotId, clientId }: CreateBookingBody) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockService.acquireSlotLock(tx, slotId);

      await tx.timeSlot.update({
        where: { id: slotId },
        data: { status: "BOOKED" },
      });

      return tx.booking.create({
        data: {
          slotId,
          clientId,
          status: "CONFIRMED",
        },
      });
    });
  }
}
