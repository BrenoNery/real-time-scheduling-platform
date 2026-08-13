/**
 * Server-only entry point for Prisma in Server Components.
 *
 * Reuses the globalThis singleton from @repo/database so that Next.js HMR
 * never creates a second PrismaClient instance. The `server-only` guard
 * causes a build-time error if this module is accidentally imported from a
 * Client Component or a client-side bundle.
 */
import "server-only";

export { prisma } from "@repo/database";
