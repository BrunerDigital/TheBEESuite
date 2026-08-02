import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DOMAIN = "@kidcityusa.com";
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-kidcity-school-login-sync");
const password = process.env.KIDCITY_DEFAULT_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase URL and service-role credentials are required.");
}
if (apply && (!confirmed || !password)) {
  throw new Error("Apply mode requires --confirm-kidcity-school-login-sync and KIDCITY_DEFAULT_PASSWORD.");
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: { endsWith: DOMAIN },
      role: UserRole.CENTER_DIRECTOR,
      isActive: true,
      accessGrants: {
        some: {
          isActive: true,
          role: UserRole.CENTER_DIRECTOR,
          scopeType: "CENTER",
          center: { status: "active", organization: { name: { contains: "Kid City", mode: "insensitive" } } },
        },
      },
    },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      tenantId: true,
      organizationId: true,
      accessGrants: {
        where: { isActive: true, role: UserRole.CENTER_DIRECTOR, scopeType: "CENTER", center: { status: "active" } },
        select: { centerId: true, center: { select: { name: true, crmLocationId: true } } },
      },
    },
  });

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const authByEmail = new Map(data.users.map((user) => [user.email?.trim().toLowerCase(), user]));
  const results: Array<{ email: string; status: "created" | "updated" | "would_create" | "would_update"; centers: string[] }> = [];

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const centerIds = Array.from(new Set(user.accessGrants.map((grant) => grant.centerId).filter((value): value is string => Boolean(value))));
    const centerNames = Array.from(new Set(user.accessGrants.map((grant) => grant.center?.name).filter((value): value is string => Boolean(value))));
    const existing = authByEmail.get(email);
    const userMetadata = {
      ...(existing?.user_metadata ?? {}),
      name: user.name,
      source: "kidcity_school_access",
    };
    const appMetadata = {
      ...(existing?.app_metadata ?? {}),
      bee_suite_role: UserRole.CENTER_DIRECTOR,
      bee_suite_tenant_id: user.tenantId,
      bee_suite_organization_id: user.organizationId,
      bee_suite_center_ids: centerIds,
    };

    if (!apply) {
      results.push({ email, status: existing ? "would_update" : "would_create", centers: centerNames });
      continue;
    }

    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password: password!,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
        ban_duration: "none",
      });
      if (updateError) throw new Error(`${email}: ${updateError.message}`);
      results.push({ email, status: "updated", centers: centerNames });
    } else {
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        password: password!,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (createError) throw new Error(`${email}: ${createError.message}`);
      results.push({ email, status: "created", centers: centerNames });
    }
  }

  const { data: verified, error: verifyError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (verifyError) throw verifyError;
  const verifiedByEmail = new Map(verified.users.map((user) => [user.email?.trim().toLowerCase(), user]));
  const failures = users.flatMap((user) => {
    const authUser = verifiedByEmail.get(user.email.trim().toLowerCase());
    const centerIds = Array.from(new Set(user.accessGrants.map((grant) => grant.centerId).filter((value): value is string => Boolean(value))));
    const authCenterIds = Array.isArray(authUser?.app_metadata?.bee_suite_center_ids) ? authUser.app_metadata.bee_suite_center_ids : [];
    const ok = Boolean(authUser?.email_confirmed_at)
      && authUser?.app_metadata?.bee_suite_role === UserRole.CENTER_DIRECTOR
      && centerIds.every((centerId) => authCenterIds.includes(centerId));
    return ok ? [] : [user.email];
  });

  if (apply && failures.length) throw new Error(`Auth verification failed for: ${failures.join(", ")}`);
  console.log(JSON.stringify({
    ok: apply ? failures.length === 0 : true,
    dryRun: !apply,
    schoolUsers: users.length,
    locationsCovered: new Set(users.flatMap((user) => user.accessGrants.map((grant) => grant.centerId))).size,
    created: results.filter((result) => result.status === "created").length,
    updated: results.filter((result) => result.status === "updated").length,
    wouldCreate: results.filter((result) => result.status === "would_create").length,
    wouldUpdate: results.filter((result) => result.status === "would_update").length,
    verified: apply ? users.length : 0,
    accounts: results,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
