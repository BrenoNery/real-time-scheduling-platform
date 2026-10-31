import fastifyJwt from "@fastify/jwt";
import type { Role } from "@repo/database";
import type { FastifyInstance } from "fastify";

const TOKEN_EXPIRES_IN = "1h";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
  }
}

export async function registerJwtPlugin(app: FastifyInstance): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to .env (see .env.example).");
  }

  await app.register(fastifyJwt, {
    secret,
    sign: { expiresIn: TOKEN_EXPIRES_IN },
  });
}
