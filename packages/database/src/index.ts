import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export {
  PrismaClient,
  Prisma,
  Role,
  SlotStatus,
  BookingStatus,
  NotificationType,
  NotificationStatus,
} from "@prisma/client";
export type * from "@prisma/client";
