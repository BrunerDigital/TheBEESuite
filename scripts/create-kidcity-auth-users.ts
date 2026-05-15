import { readFileSync } from "node:fs";

type NormalizedUser = {
  email: string;
  name: string;
  role: string;
  crmLocationId?: string;
  isActive?: boolean;
};

type NormalizedExport = {
  users: NormalizedUser[];
};

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.KIDCITY_DEFAULT_PASSWORD;
const inputPath = process.env.KIDCITY_IMPORT_FILE ?? "tmp/kidcity-crm-normalized.json";

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KIDCITY_DEFAULT_PASSWORD before creating auth users.",
  );
}

const normalized = JSON.parse(readFileSync(inputPath, "utf8")) as NormalizedExport;

async function createUser(user: NormalizedUser) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        role: user.role,
        crmLocationId: user.crmLocationId,
        source: "kidcity_legacy_crm_cutover",
      },
    }),
  });

  if (response.ok) {
    return { email: user.email, status: "created" };
  }

  const body = await response.text();
  if (
    response.status === 422 &&
    (body.toLowerCase().includes("already") || body.includes("email_exists"))
  ) {
    return { email: user.email, status: "already_exists" };
  }

  return { email: user.email, status: "failed", error: body };
}

async function main() {
  const activeUsers = normalized.users.filter((user) => user.isActive !== false);
  const results = [];
  for (const user of activeUsers) {
    results.push(await createUser(user));
  }

  const summary = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ inputPath, users: results.length, summary }, null, 2));

  const failures = results.filter((result) => result.status === "failed");
  if (failures.length) {
    console.error(JSON.stringify({ failures: failures.slice(0, 10) }, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
