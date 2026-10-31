import type { FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "@repo/database";
import { ErrorCode, apiError, loginBodySchema } from "@repo/shared";

export function registerAuthRoutes(app: FastifyInstance): void {
  // Verified when the email is unknown or has no password, so every rejected login
  // costs one scrypt run and timing does not reveal which emails exist.
  const dummyHash = hashPassword("dummy-password-for-timing");

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid login request body.", {
          issues: parsed.error.issues,
        }),
      );
    }

    const { email, password } = parsed.data;
    const user = await app.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, passwordHash: true },
    });

    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user?.passwordHash || !passwordMatches) {
      return reply
        .status(401)
        .send(apiError(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password."));
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role });
    return reply.status(200).send({ token });
  });
}
