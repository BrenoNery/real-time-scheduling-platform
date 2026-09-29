import { prisma, NotificationStatus, NotificationType } from "@repo/database";
import type { PrismaClient } from "@repo/database";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  BOOKING_CANCELLATION_JOB_NAME,
  BOOKING_CONFIRMATION_JOB_NAME,
  NOTIFICATION_QUEUE_NAME,
  type BookingCancellationJobPayload,
  type BookingConfirmationJobPayload,
  type BookingNotificationJobPayload,
} from "../queues/notification.queue.js";
import { EmailService } from "../services/email.service.js";

/** BullMQ 6 forbids `:` in queue names; ARCHITECTURE's `notifications:dlq` maps here. */
export const NOTIFICATION_DLQ_NAME = "notifications-dlq";

type NotificationJobStore = Pick<PrismaClient, "notificationJob">;

export type ConfirmationMailerPort = {
  sendConfirmation: (payload: BookingConfirmationJobPayload) => Promise<void>;
};

export type CancellationMailerPort = {
  sendCancellation: (payload: BookingCancellationJobPayload) => Promise<void>;
};

export type NotificationMailerPort = ConfirmationMailerPort & CancellationMailerPort;

export type NotificationWorkerRuntime = {
  worker: Worker<BookingNotificationJobPayload>;
  connection: Redis;
  dlq: Queue<BookingNotificationJobPayload>;
  close: () => Promise<void>;
};

type NotificationKind = typeof NotificationType.CONFIRMATION | typeof NotificationType.CANCELLATION;

function notificationKindForJobName(name: string): NotificationKind | null {
  if (name === BOOKING_CONFIRMATION_JOB_NAME) {
    return NotificationType.CONFIRMATION;
  }
  if (name === BOOKING_CANCELLATION_JOB_NAME) {
    return NotificationType.CANCELLATION;
  }
  return null;
}

async function updateNotificationJobs(
  store: NotificationJobStore,
  bookingId: string,
  type: NotificationKind,
  status: typeof NotificationStatus.SENT | typeof NotificationStatus.FAILED,
): Promise<number> {
  const result = await store.notificationJob.updateMany({
    where: {
      bookingId,
      type,
      status: NotificationStatus.PENDING,
    },
    data: {
      status,
      ...(status === NotificationStatus.SENT ? { sentAt: new Date() } : {}),
    },
  });

  return result.count;
}

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
  return updateNotificationJobs(store, bookingId, NotificationType.CONFIRMATION, status);
}

export async function updateCancellationJobs(
  store: NotificationJobStore,
  bookingId: string,
  status: typeof NotificationStatus.SENT | typeof NotificationStatus.FAILED,
): Promise<number> {
  return updateNotificationJobs(store, bookingId, NotificationType.CANCELLATION, status);
}

export async function processBookingConfirmation(
  payload: BookingConfirmationJobPayload,
  mailer: ConfirmationMailerPort,
  store: NotificationJobStore = prisma,
): Promise<void> {
  await mailer.sendConfirmation(payload);

  const updated = await updateConfirmationJobs(store, payload.bookingId, NotificationStatus.SENT);

  if (updated === 0) {
    console.warn("[NotificationWorker] No PENDING CONFIRMATION NotificationJob to mark SENT", {
      bookingId: payload.bookingId,
    });
  }
}

export async function processBookingCancellation(
  payload: BookingCancellationJobPayload,
  mailer: CancellationMailerPort,
  store: NotificationJobStore = prisma,
): Promise<void> {
  await mailer.sendCancellation(payload);

  const updated = await updateCancellationJobs(store, payload.bookingId, NotificationStatus.SENT);

  if (updated === 0) {
    console.warn("[NotificationWorker] No PENDING CANCELLATION NotificationJob to mark SENT", {
      bookingId: payload.bookingId,
    });
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
  const updated = await updateConfirmationJobs(store, payload.bookingId, NotificationStatus.FAILED);

  if (updated === 0) {
    console.warn("[NotificationWorker] No PENDING CONFIRMATION NotificationJob to mark FAILED", {
      bookingId: payload.bookingId,
    });
  }

  if (enqueueDlq) {
    await enqueueDlq(payload);
  }
}

export async function handleFinalCancellationFailure(
  payload: BookingCancellationJobPayload,
  store: NotificationJobStore,
  enqueueDlq?: (payload: BookingCancellationJobPayload) => Promise<void>,
): Promise<void> {
  const updated = await updateCancellationJobs(store, payload.bookingId, NotificationStatus.FAILED);

  if (updated === 0) {
    console.warn("[NotificationWorker] No PENDING CANCELLATION NotificationJob to mark FAILED", {
      bookingId: payload.bookingId,
    });
  }

  if (enqueueDlq) {
    await enqueueDlq(payload);
  }
}

export function createNotificationWorker(options: {
  redisUrl: string;
  emailService?: NotificationMailerPort;
  store?: NotificationJobStore;
}): NotificationWorkerRuntime {
  const emailService = options.emailService ?? new EmailService();
  const store = options.store ?? prisma;

  const connection = new Redis(options.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const dlq = new Queue<BookingNotificationJobPayload>(NOTIFICATION_DLQ_NAME, {
    connection,
  });

  const worker = new Worker<BookingNotificationJobPayload>(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      if (job.name === BOOKING_CONFIRMATION_JOB_NAME) {
        // Send errors propagate so BullMQ can retry (3 attempts, exponential backoff).
        await processBookingConfirmation(job.data, emailService, store);
        return;
      }

      if (job.name === BOOKING_CANCELLATION_JOB_NAME) {
        // Send errors propagate so BullMQ can retry (3 attempts, exponential backoff).
        await processBookingCancellation(job.data, emailService, store);
        return;
      }

      throw new Error(`Unsupported notification job: ${job.name}`);
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

    const notificationKind = notificationKindForJobName(job.name);
    if (!notificationKind) {
      return;
    }

    const enqueueDlq = async (payload: BookingNotificationJobPayload): Promise<void> => {
      await dlq.add(job.name, payload, {
        jobId: job.id ?? `booking:${payload.bookingId}:${notificationKind.toLowerCase()}:failed`,
      });
    };

    const handler =
      job.name === BOOKING_CONFIRMATION_JOB_NAME
        ? handleFinalConfirmationFailure(job.data, store, enqueueDlq)
        : handleFinalCancellationFailure(job.data, store, enqueueDlq);

    void handler.catch((dlqErr: unknown) => {
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
