import { z } from "zod";

export const createBookingBodySchema = z.object({
  slotId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;

export const bookingIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type BookingIdParams = z.infer<typeof bookingIdParamsSchema>;

/** Minimal optional filters for GET /bookings. */
export const listBookingsQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
