import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Role, hashPassword, prisma } from "@repo/database";
import { ErrorCode } from "@repo/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("POST /auth/login (BRE-90)", () => {
  const password = "correct-horse-battery";
  let app: FastifyInstance;
  let runId: string;
  let providerId: string;
  let providerEmail: string;
  let noPasswordUserId: string;
  let noPasswordEmail: string;

  before(async () => {
    runId = randomUUID();
    app = await buildApp({ logger: false });

    providerEmail = `provider-bre90-${runId}@test.local`;
    const provider = await prisma.user.create({
      data: {
        email: providerEmail,
        name: "BRE-90 Provider",
        role: Role.PROVIDER,
        passwordHash: await hashPassword(password),
      },
    });
    providerId = provider.id;

    // Mirrors users created by the /book flow, which have no password yet.
    noPasswordEmail = `client-bre90-${runId}@test.local`;
    const noPasswordUser = await prisma.user.create({
      data: { email: noPasswordEmail, name: "BRE-90 Client", role: Role.CLIENT },
    });
    noPasswordUserId = noPasswordUser.id;
  });

  after(async () => {
    try {
      const userIds = [providerId, noPasswordUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  function login(payload: unknown) {
    return app.inject({ method: "POST", url: "/auth/login", payload: payload as object });
  }

  it("stores a hash, never the plaintext password", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: providerId } });
    assert.ok(user.passwordHash?.startsWith("scrypt$"));
    assert.ok(!user.passwordHash.includes(password));
  });

  it("valid credentials return a signed JWT with sub and role only", async () => {
    // Email is normalized like the /book flow (trim + lowercase).
    const res = await login({ email: `  ${providerEmail.toUpperCase()} `, password });
    assert.equal(res.statusCode, 200);

    const { token } = res.json() as { token: string };
    assert.equal(typeof token, "string");

    const payload = app.jwt.verify<Record<string, unknown>>(token);
    assert.equal(payload.sub, providerId);
    assert.equal(payload.role, Role.PROVIDER);
    assert.equal(typeof payload.exp, "number");
    assert.equal(payload.email, undefined);
    assert.equal(payload.passwordHash, undefined);
  });

  it("wrong password, unknown email and passwordless user get the same 401 and no token", async () => {
    const responses = await Promise.all([
      login({ email: providerEmail, password: "wrong-password" }),
      login({ email: `nobody-${runId}@test.local`, password }),
      login({ email: noPasswordEmail, password }),
    ]);

    for (const res of responses) {
      assert.equal(res.statusCode, 401);
      const body = res.json() as { token?: string; error: { code: string; message: string } };
      assert.equal(body.token, undefined);
      assert.deepEqual(body, {
        error: { code: ErrorCode.INVALID_CREDENTIALS, message: "Invalid email or password." },
      });
    }
  });

  it("malformed body returns 422 VALIDATION_ERROR and no token", async () => {
    for (const payload of [{}, { email: "not-an-email", password }, { email: providerEmail }]) {
      const res = await login(payload);
      assert.equal(res.statusCode, 422);
      const body = res.json() as { token?: string; error: { code: string } };
      assert.equal(body.token, undefined);
      assert.equal(body.error.code, ErrorCode.VALIDATION_ERROR);
      assert.ok(!res.body.includes(password), "validation details must not echo the password");
    }
  });

  it("buildApp fails clearly when JWT_SECRET is missing", async () => {
    const secret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await assert.rejects(buildApp({ logger: false }), /JWT_SECRET is not set/);
    } finally {
      process.env.JWT_SECRET = secret;
    }
  });
});
