import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "@/lib/readiness-guardrails";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getRuntimeDatabaseUrl() {
  const rawUrl = getDatabaseUrl(process.env);
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
    if (!isPostgres) return rawUrl;

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? "1");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT ?? "20");
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

const runtimeDatabaseUrl = getRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : {}),
  });

globalForPrisma.prisma = prisma;
