import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Role, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("POST /auth/register (BRE-91)", () => {
  const password = "client-password-1";
  let app: FastifyInstance;
  let runId: string;
  let noPasswordEmail: string;

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    // Mirrors clients created by the old /book flow, which have no password.
    noPasswordEmail = `legacy-bre91-${runId}@test.local`;
    await prisma.user.create({
      data: { email: noPasswordEmail, name: "BRE-91 Legacy Client", role: Role.CLIENT },
    });
  });

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { contains: `bre91-${runId}` } } });
    } finally {
      await app.close();
    }
  });

  function register(payload: unknown) {
    return app.inject({ method: "POST", url: "/auth/register", payload: payload as object });
  }

  it("creates a CLIENT with a hashed password and returns a login-compatible token", async () => {
    const email = `new-bre91-${runId}@test.local`;
    const res = await register({
      name: "  New Client ",
      email: `  ${email.toUpperCase()} `,
      password,
    });
    assert.equal(res.statusCode, 201);

    const { token } = res.json() as { token: string };
    const payload = app.jwt.verify<{ sub: string; role: string }>(token);
    assert.equal(payload.role, Role.CLIENT);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.id, payload.sub);
    assert.equal(user.name, "New Client");
    assert.equal(user.role, Role.CLIENT);
    assert.ok(user.passwordHash?.startsWith("scrypt$"));

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    assert.equal(login.statusCode, 200);
    const loginPayload = app.jwt.verify<{ sub: string }>((login.json() as { token: string }).token);
    assert.equal(loginPayload.sub, user.id);
  });

  it("returns 409 EMAIL_TAKEN for an existing email, including a user without a password", async () => {
    const email = `taken-bre91-${runId}@test.local`;
    assert.equal((await register({ name: "First", email, password })).statusCode, 201);

    for (const takenEmail of [email, noPasswordEmail.toUpperCase()]) {
      const res = await register({
        name: "Intruder",
        email: takenEmail,
        password: "other-password",
      });
      assert.equal(res.statusCode, 409);
      const body = res.json() as { token?: string; error: { code: string } };
      assert.equal(body.token, undefined);
      assert.equal(body.error.code, ErrorCode.EMAIL_TAKEN);
    }

    const legacy = await prisma.user.findUniqueOrThrow({ where: { email: noPasswordEmail } });
    assert.equal(legacy.passwordHash, null);
    assert.equal(legacy.name, "BRE-91 Legacy Client");
  });

  it("returns 409 for one of two concurrent registrations of the same email", async () => {
    const email = `race-bre91-${runId}@test.local`;
    const responses = await Promise.all([
      register({ name: "Racer A", email, password }),
      register({ name: "Racer B", email, password }),
    ]);
    const statuses = responses.map((res) => res.statusCode).sort();
    assert.deepEqual(statuses, [201, 409]);
  });

  it("returns 422 VALIDATION_ERROR for an invalid body", async () => {
    for (const payload of [
      {},
      { name: "No Email", password },
      { name: "Bad Email", email: "not-an-email", password },
      { name: "Short Password", email: `short-bre91-${runId}@test.local`, password: "1234567" },
      { name: "   ", email: `blank-bre91-${runId}@test.local`, password },
    ]) {
      const res = await register(payload);
      assert.equal(res.statusCode, 422);
      assert.equal(
        (res.json() as { error: { code: string } }).error.code,
        ErrorCode.VALIDATION_ERROR,
      );
    }
  });
});
