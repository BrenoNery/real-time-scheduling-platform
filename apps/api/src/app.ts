import Fastify from "fastify";
import { registerPrismaPlugin } from "./plugins/prisma.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({
    logger: options?.logger ?? true,
  });

  await registerPrismaPlugin(app);
  registerHealthRoutes(app);
  registerBookingRoutes(app);

  return app;
}
