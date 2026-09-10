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
  SlotNotMutableError,
  isSlotNotMutableError,
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

export {
  MAX_GENERATE_RANGE_DAYS,
  listSlotsQuerySchema,
  generateSlotsBodySchema,
  slotIdParamsSchema,
  updateSlotBodySchema,
  parseCalendarDate,
  clockTimeToMinutes,
} from "./slots.js";
export type {
  SlotStatusValue,
  ListSlotsQuery,
  GenerateSlotsBody,
  GenerateSlotsResponse,
  SlotIdParams,
  UpdateSlotBody,
} from "./slots.js";
