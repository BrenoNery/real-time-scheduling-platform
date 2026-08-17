import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async (request, reply) => {
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: "connected" };
    } catch (err) {
      request.log.error({ err }, "Database health check failed");
      return reply.status(503).send({ status: "degraded", db: "disconnected" });
    }
  });
}
