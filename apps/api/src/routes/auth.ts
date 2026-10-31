import type { FastifyInstance } from "fastify";
import { Prisma, Role, hashPassword, verifyPassword } from "@repo/database";
import { ErrorCode, apiError, loginBodySchema, registerBodySchema } from "@repo/shared";

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

  // Always creates a CLIENT. An existing email answers 409, even when that user has no
  // password yet, so registering cannot take over an account created by the old /book flow.
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid registration request body.", {
          issues: parsed.error.issues,
        }),
      );
    }

    const { name, email, password } = parsed.data;
    let user: { id: string; role: Role };
    try {
      user = await app.prisma.user.create({
        data: { name, email, role: Role.CLIENT, passwordHash: await hashPassword(password) },
        select: { id: true, role: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply
          .status(409)
          .send(apiError(ErrorCode.EMAIL_TAKEN, "An account with this email already exists."));
      }
      throw err;
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role });
    return reply.status(201).send({ token });
  });
}
