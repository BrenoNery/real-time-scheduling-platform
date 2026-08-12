import { Queue } from "bullmq";
import { Redis } from "ioredis";

/** Payload for `booking.confirmation` jobs (ARCHITECTURE.md §6). */
export type BookingConfirmationJobPayload = {
  bookingId: string;
  clientEmail: string;
  clientName: string;
  slotStartsAt: string;
  serviceName: string;
};

export const NOTIFICATION_QUEUE_NAME = "notifications";
export const BOOKING_CONFIRMATION_JOB_NAME = "booking.confirmation";

let confirmationQueue: Queue<BookingConfirmationJobPayload> | null = null;
let redisConnection: Redis | null = null;

function getRedisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url && url.length > 0 ? url : undefined;
}

function getRedisConnection(): Redis | null {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  if (!redisConnection) {
    // Constructed client required for BullMQ under native ESM.
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  return redisConnection;
}

/**
 * Lazy BullMQ producer for booking confirmation emails.
 * Returns null when REDIS_URL is unset (producer becomes a no-op).
 */
export function getNotificationQueue(): Queue<BookingConfirmationJobPayload> | null {
  const connection = getRedisConnection();
  if (!connection) {
    return null;
  }

  if (!confirmationQueue) {
    confirmationQueue = new Queue<BookingConfirmationJobPayload>(
      NOTIFICATION_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      },
    );
  }

  return confirmationQueue;
}

/**
 * Enqueue a confirmation job. Idempotent via jobId `booking:{id}:confirmation`.
 * Callers must treat failures as non-fatal after a committed booking.
 */
export async function enqueueBookingConfirmation(
  payload: BookingConfirmationJobPayload,
): Promise<void> {
  const queue = getNotificationQueue();
  if (!queue) {
    return;
  }

  const connection = getRedisConnection();
  if (connection && connection.status === "wait") {
    await connection.connect();
  }

  await queue.add(BOOKING_CONFIRMATION_JOB_NAME, payload, {
    jobId: `booking:${payload.bookingId}:confirmation`,
  });
}

export async function closeNotificationQueue(): Promise<void> {
  const queue = confirmationQueue;
  confirmationQueue = null;
  if (queue) {
    try {
      await queue.close();
    } catch {
      // Ignore close errors from partially initialized connections.
    }
  }

  const connection = redisConnection;
  redisConnection = null;
  if (connection) {
    try {
      connection.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown.
    }
  }
}
