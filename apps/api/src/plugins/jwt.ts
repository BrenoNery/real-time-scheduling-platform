import fastifyJwt from "@fastify/jwt";
import type { Role } from "@repo/database";
import { ErrorCode, apiError } from "@repo/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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

/**
 * preHandler for protected routes: 401 when the bearer token is missing, invalid or
 * expired, 403 when it belongs to another role. On success `request.user` is set.
 */
export function requireRole(role: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply
        .status(401)
        .send(apiError(ErrorCode.UNAUTHORIZED, "A valid bearer token is required."));
    }

    if (request.user.role !== role) {
      return reply
        .status(403)
        .send(apiError(ErrorCode.FORBIDDEN, `This action requires the ${role} role.`));
    }
  };
}
