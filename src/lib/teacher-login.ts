export const DEFAULT_TEACHER_LOGIN_DOMAIN = "thebeesuite.io";
export const DEFAULT_TEACHER_INITIAL_PASSWORD = "BusyBees";

type TeacherLoginNameInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

type TeacherLoginConfigEnv = {
  [key: string]: string | undefined;
  TEACHER_LOGIN_DOMAIN?: string;
  DEFAULT_TEACHER_INITIAL_PASSWORD?: string;
};

export type TeacherLoginCredentials = {
  email: string;
  temporary_password: string;
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

export function getTeacherLoginDomain(env: TeacherLoginConfigEnv = process.env) {
  const configured = clean(env.TEACHER_LOGIN_DOMAIN)
    .replace(/^@+/, "")
    .toLowerCase();
  return configured || DEFAULT_TEACHER_LOGIN_DOMAIN;
}

export function getDefaultTeacherInitialPassword(env: TeacherLoginConfigEnv = process.env) {
  return clean(env.DEFAULT_TEACHER_INITIAL_PASSWORD) || DEFAULT_TEACHER_INITIAL_PASSWORD;
}

export function normalizeTeacherLoginNamePart(value?: string | null) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function nameTokens(fullName?: string | null) {
  return clean(fullName)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildTeacherLoginLocalPart(input: TeacherLoginNameInput) {
  const tokens = nameTokens(input.fullName);
  const firstSource = clean(input.firstName) || (tokens.length > 1 ? tokens.slice(0, -1).join(" ") : tokens[0] ?? "");
  const lastSource = clean(input.lastName) || (tokens.length > 1 ? tokens[tokens.length - 1] : "teacher");
  const first = normalizeTeacherLoginNamePart(firstSource) || "teacher";
  const last = normalizeTeacherLoginNamePart(lastSource) || "teacher";

  return `${first}.${last}`;
}

export function buildTeacherLoginEmail(input: TeacherLoginNameInput & { domain?: string | null; suffix?: number }) {
  const base = buildTeacherLoginLocalPart(input);
  const domain = clean(input.domain)?.replace(/^@+/, "").toLowerCase() || getTeacherLoginDomain();
  const suffix = input.suffix && input.suffix > 1 ? String(input.suffix) : "";
  return `${base}${suffix}@${domain}`;
}

export async function generateTeacherLoginCredentials(input: TeacherLoginNameInput & {
  domain?: string | null;
  emailExists: (email: string) => boolean | Promise<boolean>;
  maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? 500;

  for (let suffix = 1; suffix <= maxAttempts; suffix += 1) {
    const email = buildTeacherLoginEmail({ ...input, suffix });
    if (!(await input.emailExists(email))) {
      return {
        email,
        temporary_password: getDefaultTeacherInitialPassword(),
      } satisfies TeacherLoginCredentials;
    }
  }

  throw new Error("Could not generate a unique teacher login username.");
}

export function isGeneratedTeacherLoginEmail(email: string, domain = getTeacherLoginDomain()) {
  const normalizedDomain = domain.replace(/^@+/, "").toLowerCase();
  return clean(email).toLowerCase().endsWith(`@${normalizedDomain}`);
}
