import type { FastifyInstance } from "fastify";
import {
  ErrorCode,
  apiError,
  bookingIdParamsSchema,
  createBookingBodySchema,
  isNotFoundError,
  isSlotUnavailableError,
  listBookingsQuerySchema,
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

  app.get("/bookings", async (request, reply) => {
    const parsed = listBookingsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid booking list query.", {
          issues: parsed.error.issues,
        }),
      );
    }

    const bookings = await bookingService.listBookings(parsed.data);
    return reply.status(200).send(bookings);
  });

  app.get("/bookings/:id", async (request, reply) => {
    const parsed = bookingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid booking id.", {
          issues: parsed.error.issues,
        }),
      );
    }

    try {
      const booking = await bookingService.getBookingById(parsed.data.id);
      return reply.status(200).send(booking);
    } catch (err) {
      if (isNotFoundError(err)) {
        return reply.status(404).send(
          apiError(ErrorCode.NOT_FOUND, err.message, {
            resource: err.resource,
            id: err.resourceId,
          }),
        );
      }

      throw err;
    }
  });

  app.delete("/bookings/:id", async (request, reply) => {
    const parsed = bookingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid booking id.", {
          issues: parsed.error.issues,
        }),
      );
    }

    try {
      const booking = await bookingService.cancelBooking(parsed.data.id);
      return reply.status(200).send(booking);
    } catch (err) {
      if (isNotFoundError(err)) {
        return reply.status(404).send(
          apiError(ErrorCode.NOT_FOUND, err.message, {
            resource: err.resource,
            id: err.resourceId,
          }),
        );
      }

      throw err;
    }
  });
}
