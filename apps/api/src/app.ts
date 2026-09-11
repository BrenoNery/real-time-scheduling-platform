import Fastify from "fastify";
import { registerPrismaPlugin } from "./plugins/prisma.js";
import { closeNotificationQueue } from "./queues/notification.queue.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSlotRoutes } from "./routes/slots.js";

export async function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({
    logger: options?.logger ?? true,
  });

  await registerPrismaPlugin(app);
  registerHealthRoutes(app);
  registerBookingRoutes(app);
  registerSlotRoutes(app);

  app.addHook("onClose", async () => {
    await closeNotificationQueue();
  });

  return app;
}
