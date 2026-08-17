import { prisma, NotificationStatus, NotificationType } from "@repo/database";
import type { PrismaClient } from "@repo/database";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  BOOKING_CONFIRMATION_JOB_NAME,
  NOTIFICATION_QUEUE_NAME,
  type BookingConfirmationJobPayload,
} from "../queues/notification.queue.js";
import { EmailService } from "../services/email.service.js";

/** BullMQ 6 forbids `:` in queue names; ARCHITECTURE's `notifications:dlq` maps here. */
export const NOTIFICATION_DLQ_NAME = "notifications-dlq";

type NotificationJobStore = Pick<PrismaClient, "notificationJob">;

export type ConfirmationMailerPort = {
  sendConfirmation: (payload: BookingConfirmationJobPayload) => Promise<void>;
};

export type NotificationWorkerRuntime = {
  worker: Worker<BookingConfirmationJobPayload>;
  connection: Redis;
  dlq: Queue<BookingConfirmationJobPayload>;
  close: () => Promise<void>;
};

/**
 * Mark PENDING CONFIRMATION rows for a booking.
 * Rule: update every PENDING CONFIRMATION for that bookingId (not only the latest).
 * Missing rows are a no-op so a committed booking still gets email if insert failed.
 */
export async function updateConfirmationJobs(
  store: NotificationJobStore,
  bookingId: string,
  status: typeof NotificationStatus.SENT | typeof NotificationStatus.FAILED,
): Promise<number> {
  const result = await store.notificationJob.updateMany({
    where: {
      bookingId,
      type: NotificationType.CONFIRMATION,
      status: NotificationStatus.PENDING,
    },
    data: {
      status,
      ...(status === NotificationStatus.SENT ? { sentAt: new Date() } : {}),
    },
  });

  return result.count;
}

export async function processBookingConfirmation(
  payload: BookingConfirmationJobPayload,
  mailer: ConfirmationMailerPort,
  store: NotificationJobStore = prisma,
): Promise<void> {
  await mailer.sendConfirmation(payload);

  const updated = await updateConfirmationJobs(
    store,
    payload.bookingId,
    NotificationStatus.SENT,
  );

  if (updated === 0) {
    console.warn(
      "[NotificationWorker] No PENDING CONFIRMATION NotificationJob to mark SENT",
      { bookingId: payload.bookingId },
    );
  }
}

export function isFinalAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

export async function handleFinalConfirmationFailure(
  payload: BookingConfirmationJobPayload,
  store: NotificationJobStore,
  enqueueDlq?: (payload: BookingConfirmationJobPayload) => Promise<void>,
): Promise<void> {
  const updated = await updateConfirmationJobs(
    store,
    payload.bookingId,
    NotificationStatus.FAILED,
  );

  if (updated === 0) {
    console.warn(
      "[NotificationWorker] No PENDING CONFIRMATION NotificationJob to mark FAILED",
      { bookingId: payload.bookingId },
    );
  }

  if (enqueueDlq) {
    await enqueueDlq(payload);
  }
}

export function createNotificationWorker(options: {
  redisUrl: string;
  emailService?: ConfirmationMailerPort;
  store?: NotificationJobStore;
}): NotificationWorkerRuntime {
  const emailService = options.emailService ?? new EmailService();
  const store = options.store ?? prisma;

  const connection = new Redis(options.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const dlq = new Queue<BookingConfirmationJobPayload>(NOTIFICATION_DLQ_NAME, {
    connection,
  });

  const worker = new Worker<BookingConfirmationJobPayload>(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      if (job.name !== BOOKING_CONFIRMATION_JOB_NAME) {
        throw new Error(`Unsupported notification job: ${job.name}`);
      }

      // Send errors propagate so BullMQ can retry (3 attempts, exponential backoff).
      await processBookingConfirmation(job.data, emailService, store);
    },
    { connection },
  );

  worker.on("completed", (job) => {
    console.info("[NotificationWorker] Job completed", {
      jobId: job.id,
      bookingId: job.data.bookingId,
    });
  });

  worker.on("failed", (job, err) => {
    console.error("[NotificationWorker] Job failed", {
      jobId: job?.id,
      bookingId: job?.data.bookingId,
      attemptsMade: job?.attemptsMade,
      err,
    });

    if (!job || !isFinalAttempt(job)) {
      return;
    }

    void handleFinalConfirmationFailure(job.data, store, async (payload) => {
      await dlq.add(BOOKING_CONFIRMATION_JOB_NAME, payload, {
        jobId: job.id ?? `booking:${payload.bookingId}:confirmation:failed`,
      });
    }).catch((dlqErr: unknown) => {
      console.error("[NotificationWorker] Failed to record final failure / DLQ", {
        jobId: job.id,
        bookingId: job.data.bookingId,
        err: dlqErr,
      });
    });
  });

  worker.on("error", (err) => {
    console.error("[NotificationWorker] Worker error", err);
  });

  return {
    worker,
    connection,
    dlq,
    close: async () => {
      await worker.close();
      await dlq.close();
      connection.disconnect();
    },
  };
}
