import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotificationStatus, NotificationType, type Prisma } from "@repo/database";
import type { BookingConfirmationJobPayload } from "../src/queues/notification.queue.js";
import { EmailService } from "../src/services/email.service.js";
import {
  handleFinalConfirmationFailure,
  isFinalAttempt,
  processBookingConfirmation,
  updateConfirmationJobs,
} from "../src/workers/notification.worker.js";

const payload: BookingConfirmationJobPayload = {
  bookingId: "11111111-1111-1111-1111-111111111111",
  clientEmail: "ada@example.com",
  clientName: "Ada Lovelace",
  slotStartsAt: "2031-01-01T10:00:00.000Z",
  serviceName: "Introductory consult",
};

type FakeRow = {
  bookingId: string;
  type: NotificationType;
  status: NotificationStatus;
  sentAt: Date | null;
};

function createFakeStore(rows: FakeRow[]) {
  return {
    notificationJob: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          bookingId: string;
          type: NotificationType;
          status: NotificationStatus;
        };
        data: Prisma.NotificationJobUpdateManyMutationInput;
      }) => {
        let count = 0;
        for (const row of rows) {
          if (
            row.bookingId === where.bookingId &&
            row.type === where.type &&
            row.status === where.status
          ) {
            if (data.status !== undefined) {
              row.status = data.status as NotificationStatus;
            }
            if (data.sentAt !== undefined) {
              row.sentAt = data.sentAt as Date;
            }
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}

describe("EmailService.sendConfirmation", () => {
  it("sends a text email whose subject includes the service name", async () => {
    const sent: Array<{
      to?: string | string[];
      subject?: string;
      text?: string;
    }> = [];

    const emailService = new EmailService({
      sendMail: async (mail) => {
        sent.push(mail);
        return mail;
      },
      close: () => undefined,
    });

    await emailService.sendConfirmation(payload);

    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, payload.clientEmail);
    assert.match(sent[0]!.subject ?? "", /Introductory consult/);
    assert.match(sent[0]!.text ?? "", /Ada Lovelace/);
    assert.match(sent[0]!.text ?? "", /2031-01-01T10:00:00.000Z/);
  });
});

describe("processBookingConfirmation", () => {
  it("sends email then marks PENDING CONFIRMATION rows SENT", async () => {
    const rows: FakeRow[] = [
      {
        bookingId: payload.bookingId,
        type: NotificationType.CONFIRMATION,
        status: NotificationStatus.PENDING,
        sentAt: null,
      },
      {
        bookingId: payload.bookingId,
        type: NotificationType.CONFIRMATION,
        status: NotificationStatus.PENDING,
        sentAt: null,
      },
    ];
    const store = createFakeStore(rows);
    let sendCount = 0;

    await processBookingConfirmation(
      payload,
      {
        sendConfirmation: async () => {
          sendCount += 1;
        },
      },
      store,
    );

    assert.equal(sendCount, 1);
    assert.ok(rows.every((row) => row.status === NotificationStatus.SENT));
    assert.ok(rows.every((row) => row.sentAt instanceof Date));
  });

  it("still sends email and no-ops when no NotificationJob row exists", async () => {
    const store = createFakeStore([]);
    let sendCount = 0;

    await processBookingConfirmation(
      payload,
      {
        sendConfirmation: async () => {
          sendCount += 1;
        },
      },
      store,
    );

    assert.equal(sendCount, 1);
  });

  it("propagates send errors so BullMQ can retry and leaves rows PENDING", async () => {
    const rows: FakeRow[] = [
      {
        bookingId: payload.bookingId,
        type: NotificationType.CONFIRMATION,
        status: NotificationStatus.PENDING,
        sentAt: null,
      },
    ];
    const store = createFakeStore(rows);

    await assert.rejects(
      () =>
        processBookingConfirmation(
          payload,
          {
            sendConfirmation: async () => {
              throw new Error("SMTP down");
            },
          },
          store,
        ),
      /SMTP down/,
    );

    assert.equal(rows[0]!.status, NotificationStatus.PENDING);
    assert.equal(rows[0]!.sentAt, null);
  });
});

describe("handleFinalConfirmationFailure", () => {
  it("marks PENDING CONFIRMATION rows FAILED and enqueues DLQ", async () => {
    const rows: FakeRow[] = [
      {
        bookingId: payload.bookingId,
        type: NotificationType.CONFIRMATION,
        status: NotificationStatus.PENDING,
        sentAt: null,
      },
    ];
    const store = createFakeStore(rows);
    const dlq: BookingConfirmationJobPayload[] = [];

    await handleFinalConfirmationFailure(payload, store, async (job) => {
      dlq.push(job);
    });

    assert.equal(rows[0]!.status, NotificationStatus.FAILED);
    assert.equal(rows[0]!.sentAt, null);
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0]!.bookingId, payload.bookingId);
  });
});

describe("isFinalAttempt / updateConfirmationJobs", () => {
  it("treats attemptsMade >= configured attempts as final", () => {
    assert.equal(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } }), false);
    assert.equal(isFinalAttempt({ attemptsMade: 3, opts: { attempts: 3 } }), true);
  });

  it("does not update non-PENDING confirmation rows", async () => {
    const rows: FakeRow[] = [
      {
        bookingId: payload.bookingId,
        type: NotificationType.CONFIRMATION,
        status: NotificationStatus.SENT,
        sentAt: new Date("2031-01-01T10:05:00.000Z"),
      },
    ];
    const store = createFakeStore(rows);

    const count = await updateConfirmationJobs(store, payload.bookingId, NotificationStatus.FAILED);

    assert.equal(count, 0);
    assert.equal(rows[0]!.status, NotificationStatus.SENT);
  });
});
