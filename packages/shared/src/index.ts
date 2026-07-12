import { z } from "zod";

export const APP_NAME = "real-time-scheduling-platform" as const;

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
