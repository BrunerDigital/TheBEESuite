import "./load-env";
import { prisma } from "@/lib/prisma";
import { runCli } from "./send-imported-parent-invitation-wave";

void runCli()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
