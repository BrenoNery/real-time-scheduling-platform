import type { FastifyInstance } from "fastify";
import {
  ErrorCode,
  apiError,
  createBookingBodySchema,
  isSlotUnavailableError,
} from "@repo/shared";
import { BookingService } from "../services/booking.service.js";

export function registerBookingRoutes(app: FastifyInstance): void {
  const bookingService = new BookingService(app.prisma);

  app.post("/bookings", async (request, reply) => {
    const parsed = createBookingBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid booking request body.", {
          issues: parsed.error.issues,
        }),
      );
    }

    try {
      const booking = await bookingService.createBooking(parsed.data);
      return reply.status(201).send(booking);
    } catch (err) {
      if (isSlotUnavailableError(err)) {
        return reply.status(409).send(
          apiError(ErrorCode.SLOT_UNAVAILABLE, err.message, {
            slotId: err.slotId,
          }),
        );
      }

      throw err;
    }
  });
}
