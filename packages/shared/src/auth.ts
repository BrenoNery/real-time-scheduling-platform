import { z } from "zod";

/** Body for POST /auth/login. Email is normalized the same way the /book flow stores it. */
export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
