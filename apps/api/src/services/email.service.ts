import { createTransport, type Transporter } from "nodemailer";
import type { BookingConfirmationJobPayload } from "../queues/notification.queue.js";

export type ConfirmationMailer = Pick<Transporter, "sendMail" | "close">;

function createSmtpTransport(): Transporter {
  return createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
}

export class EmailService {
  private readonly transport: ConfirmationMailer;

  constructor(transport: ConfirmationMailer = createSmtpTransport()) {
    this.transport = transport;
  }

  async sendConfirmation(payload: BookingConfirmationJobPayload): Promise<void> {
    await this.transport.sendMail({
      from: "Scheduling Platform <noreply@scheduling.local>",
      to: payload.clientEmail,
      subject: `Booking confirmation: ${payload.serviceName}`,
      text: [
        `Hello ${payload.clientName},`,
        "",
        `Your booking for ${payload.serviceName} is confirmed.`,
        `When: ${payload.slotStartsAt}`,
        `Booking ID: ${payload.bookingId}`,
        "",
        "Thank you.",
      ].join("\n"),
    });
  }

  close(): void {
    this.transport.close();
  }
}
