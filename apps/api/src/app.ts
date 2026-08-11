import Fastify from "fastify";
import { registerPrismaPlugin } from "./plugins/prisma.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await registerPrismaPlugin(app);
  registerHealthRoutes(app);

  return app;
}
