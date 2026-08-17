import { prisma } from "@repo/database";
import { EmailService } from "./services/email.service.js";
import { createNotificationWorker } from "./workers/notification.worker.js";

function getRedisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url && url.length > 0 ? url : undefined;
}

async function start() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    console.error(
      "[worker] REDIS_URL is not set. The notification worker cannot start without Redis (the API producer may no-op when REDIS_URL is missing).",
    );
    process.exit(1);
  }

  const emailService = new EmailService();
  const runtime = createNotificationWorker({
    redisUrl,
    emailService,
    store: prisma,
  });

  console.info("[worker] Notification worker started", {
    queue: "notifications",
    smtpHost: process.env.SMTP_HOST ?? "localhost",
    smtpPort: process.env.SMTP_PORT ?? "1025",
  });

  const shutdown = async (signal: string) => {
    console.info(`[worker] Received ${signal}, shutting down gracefully`);

    try {
      await runtime.close();
      emailService.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      console.error("[worker] Shutdown failed", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

void start();
