import { prisma, type PrismaClient } from "@repo/database";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export async function registerPrismaPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("prisma", prisma);

  app.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });
}
