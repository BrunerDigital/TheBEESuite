import { PrismaClient } from "@prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/readiness-guardrails";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const runtimeDatabaseUrl = getRuntimeDatabaseUrl(process.env);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : {}),
  });

globalForPrisma.prisma = prisma;
