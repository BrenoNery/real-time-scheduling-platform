import { z } from "zod";

export const createBookingBodySchema = z.object({
  slotId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
