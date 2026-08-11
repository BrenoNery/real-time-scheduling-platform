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
} from "./errors.js";
export type { ApiErrorEnvelope } from "./errors.js";

export { createBookingBodySchema } from "./bookings.js";
export type { CreateBookingBody } from "./bookings.js";
