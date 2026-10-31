import type { Role } from "@repo/database";
import type { FastifyInstance } from "fastify";

/** Authorization header carrying a token signed like the ones POST /auth/login issues. */
export function authHeader(app: FastifyInstance, sub: string, role: Role) {
  return { authorization: `Bearer ${app.jwt.sign({ sub, role })}` };
}
