import { z } from "zod";

export const APP_NAME = "real-time-scheduling-platform" as const;

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;

export {
  ErrorCode,
  apiError,
  SlotUnavailableError,
  isSlotUnavailableError,
  NotFoundError,
  isNotFoundError,
} from "./errors.js";
export type { ApiErrorEnvelope } from "./errors.js";

export {
  createBookingBodySchema,
  bookingIdParamsSchema,
  listBookingsQuerySchema,
} from "./bookings.js";
export type { CreateBookingBody, BookingIdParams, ListBookingsQuery } from "./bookings.js";
