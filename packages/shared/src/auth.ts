import { z } from "zod";

/** Body for POST /auth/login. Email is normalized the same way the /book flow stores it. */
export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

/** Body for POST /auth/register, which creates a CLIENT account. */
export const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
