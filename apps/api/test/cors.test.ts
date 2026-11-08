import assert from "node:assert/strict";
import { afterEach, before, after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { readWebOrigin } from "../src/plugins/cors.js";

const ALLOWED = "http://localhost:3000";

describe("CORS restricted to WEB_ORIGIN (BRE-93)", () => {
  let app: FastifyInstance;
  const previous = process.env.WEB_ORIGIN;

  before(async () => {
    process.env.WEB_ORIGIN = ALLOWED;
    app = await buildApp({ logger: false });
  });

  after(async () => {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
    await app.close();
  });

  afterEach(() => {
    process.env.WEB_ORIGIN = ALLOWED;
  });

  it("echoes the allowed origin exactly, with Vary: Origin", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { origin: ALLOWED } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], ALLOWED);
    assert.match(String(res.headers.vary), /Origin/i);
    assert.equal(res.headers["access-control-allow-credentials"], undefined);
  });

  it("answers the preflight for the allowed origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/bookings",
      headers: { origin: ALLOWED, "access-control-request-method": "POST" },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], ALLOWED);
  });

  it("sends no Access-Control-Allow-Origin to another origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.example" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  it("serves requests without Origin normally", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  it("rejects an invalid WEB_ORIGIN", () => {
    for (const bad of ["*", "localhost:3000", "ftp://x.test", "http://localhost:3000/", "x"]) {
      process.env.WEB_ORIGIN = bad;
      assert.throws(() => readWebOrigin(), /WEB_ORIGIN/, bad);
    }
    process.env.WEB_ORIGIN = "https://app.example.com";
    assert.equal(readWebOrigin(), "https://app.example.com");
  });
});
