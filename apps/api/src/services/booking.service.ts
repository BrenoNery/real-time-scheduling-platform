import type { Prisma, PrismaClient } from "@repo/database";
import type { CreateBookingBody, ListBookingsQuery } from "@repo/shared";
import { NotFoundError } from "@repo/shared";
import {
  enqueueBookingConfirmation,
  type BookingConfirmationJobPayload,
} from "../queues/notification.queue.js";
import { LockService } from "./lock.service.js";

const bookingInclude = {
  slot: { include: { service: true } },
  client: true,
} as const;

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

export class BookingService {
  private readonly lockService: LockService;

  constructor(private readonly prisma: PrismaClient) {
    this.lockService = new LockService();
  }

  /**
   * Atomically book a slot: FOR UPDATE lock → mark BOOKED → insert CONFIRMED booking.
   * After COMMIT, enqueues confirmation (NotificationJob + BullMQ). Enqueue failures
   * never roll back a committed booking.
   */
  async createBooking({ slotId, clientId }: CreateBookingBody): Promise<BookingWithRelations> {
    const booking = await this.prisma.$transaction(async (tx) => {
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
        include: bookingInclude,
      });
    });

    await this.enqueueConfirmationSafe(booking);

    return booking;
  }

  async listBookings(query: ListBookingsQuery = {}): Promise<BookingWithRelations[]> {
    return this.prisma.booking.findMany({
      where: {
        ...(query.clientId !== undefined ? { clientId: query.clientId } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
      },
      include: bookingInclude,
      orderBy: { bookedAt: "desc" },
    });
  }

  async getBookingById(id: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });

    if (!booking) {
      throw new NotFoundError("Booking", id);
    }

    return booking;
  }

  /**
   * Soft-cancel a booking: lock row → CANCELLED + cancelledAt → free TimeSlot.
   * Already-cancelled bookings return NOT_FOUND (same as missing).
   */
  async cancelBooking(id: string): Promise<BookingWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; slot_id: string }>>`
        SELECT id, status, slot_id
        FROM bookings
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      const locked = rows[0];
      if (!locked) {
        throw new NotFoundError("Booking", id);
      }

      if (locked.status === "CANCELLED") {
        throw new NotFoundError("Booking", id, "Booking is already cancelled.");
      }

      const booking = await tx.booking.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
        include: bookingInclude,
      });

      await tx.timeSlot.update({
        where: { id: locked.slot_id },
        data: { status: "AVAILABLE" },
      });

      return booking;
    });
  }

  /**
   * Persist PENDING NotificationJob and enqueue BullMQ `booking.confirmation`.
   * Errors are logged and swallowed so the HTTP response stays 201.
   */
  private async enqueueConfirmationSafe(booking: BookingWithRelations): Promise<void> {
    const payload: BookingConfirmationJobPayload = {
      bookingId: booking.id,
      clientEmail: booking.client.email,
      clientName: booking.client.name,
      slotStartsAt: booking.slot.startsAt.toISOString(),
      serviceName: booking.slot.service.name,
    };

    try {
      await this.prisma.notificationJob.create({
        data: {
          bookingId: booking.id,
          type: "CONFIRMATION",
          status: "PENDING",
          payload,
        },
      });
    } catch (err) {
      console.error("[BookingService] Failed to persist NotificationJob after commit", {
        bookingId: booking.id,
        err,
      });
    }

    try {
      await enqueueBookingConfirmation(payload);
    } catch (err) {
      // Redis/BullMQ outages must not fail the booking after COMMIT.
      console.error("[BookingService] Failed to enqueue BullMQ booking.confirmation", {
        bookingId: booking.id,
        err,
      });
    }
  }
}
