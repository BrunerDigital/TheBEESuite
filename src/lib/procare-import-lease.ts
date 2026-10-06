import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Serialize all import commits for one school across requests and deployments.
// The existing bucket table provides an atomic unique key; no schema change is needed.
export async function acquireProcareImportLease(key: string) {
  const nonce = randomInt(1, 2_147_483_647);
  const resetAt = new Date(Date.now() + 330_000);
  try {
    await prisma.rateLimitBucket.create({ data: { key, count: nonce, resetAt } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const result = await prisma.rateLimitBucket.updateMany({
      where: { key, resetAt: { lte: new Date() } }, data: { count: nonce, resetAt },
    });
    if (result.count !== 1) return null;
  }
  return async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key, count: nonce } });
  };
}
