import { prisma } from "../src/lib/prisma";
import { evaluateDatabaseSecurityPosture, type DatabaseSecurityPosture } from "../src/lib/security-readiness";

type CountRow = { public_table_count: bigint; rls_enabled_count: bigint };
type NameRow = { name: string };
type GrantRow = { grantee: string; table_name: string; privileges: string[] };

async function main() {
  const [counts, noRls, grants, definerFunctions, unsafeViews] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT count(*)::bigint AS public_table_count,
             count(*) FILTER (WHERE c.relrowsecurity)::bigint AS rls_enabled_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `,
    prisma.$queryRaw<NameRow[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY c.relname
    `,
    prisma.$queryRaw<GrantRow[]>`
      SELECT grantee, table_name, array_agg(privilege_type ORDER BY privilege_type) AS privileges
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
      GROUP BY grantee, table_name
      ORDER BY table_name, grantee
    `,
    prisma.$queryRaw<NameRow[]>`
      SELECT p.proname AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
      ORDER BY p.proname
    `,
    prisma.$queryRaw<NameRow[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'v'
        AND COALESCE(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']::text[] IS FALSE
      ORDER BY c.relname
    `,
  ]);

  const posture: DatabaseSecurityPosture = {
    publicTableCount: Number(counts[0]?.public_table_count ?? 0),
    rlsEnabledCount: Number(counts[0]?.rls_enabled_count ?? 0),
    tablesWithoutRls: noRls.map((row) => row.name),
    browserTableGrants: grants.map((row) => ({ grantee: row.grantee, tableName: row.table_name, privileges: row.privileges })),
    publicSecurityDefinerFunctions: definerFunctions.map((row) => row.name),
    unsafePublicViews: unsafeViews.map((row) => row.name),
  };
  const findings = evaluateDatabaseSecurityPosture(posture);

  process.stdout.write(`${JSON.stringify({ posture, findings }, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`Security posture audit failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
