import type { Prisma } from "@prisma/client";

export type TeacherProfileSetupInput = {
  name: string;
  contactEmail: string | null;
  phone: string | null;
  title: string;
  classroomId: string | null;
  staffKioskPin: string | null;
};

type NormalizeOptions = {
  allowedClassroomIds?: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNullable(value: unknown, maxLength = 160) {
  const text = clean(value, maxLength);
  return text || null;
}

function cleanEmail(value: unknown) {
  const email = clean(value, 160).toLowerCase();
  return email || null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeTeacherProfileSetupPayload(body: unknown, options: NormalizeOptions = {}) {
  const input = asRecord(body);
  const name = clean(input.name, 120);
  const contactEmail = cleanEmail(input.contactEmail ?? input.email);
  const phone = cleanNullable(input.phone, 40);
  const title = clean(input.title, 80) || "Teacher";
  const classroomId = cleanNullable(input.classroomId, 80);
  const staffKioskPin = cleanNullable(input.staffKioskPin, 4);

  if (!name) {
    return { ok: false as const, error: "Teacher name is required." };
  }
  if (contactEmail && !validEmail(contactEmail)) {
    return { ok: false as const, error: "Enter a valid contact email." };
  }
  if (staffKioskPin && !/^\d{4}$/.test(staffKioskPin)) {
    return { ok: false as const, error: "Staff kiosk code must be exactly 4 digits." };
  }
  if (classroomId && options.allowedClassroomIds && !options.allowedClassroomIds.includes(classroomId)) {
    return { ok: false as const, error: "Choose a classroom from your assigned school." };
  }

  return {
    ok: true as const,
    input: {
      name,
      contactEmail,
      phone,
      title,
      classroomId,
      staffKioskPin,
    } satisfies TeacherProfileSetupInput,
  };
}

export function teacherProfileSetupCustomFields({
  customFields,
  input,
  updatedAt,
  updatedById,
}: {
  customFields: unknown;
  input: Pick<TeacherProfileSetupInput, "contactEmail">;
  updatedAt: Date;
  updatedById: string;
}) {
  const fields = { ...asRecord(customFields) };
  if (input.contactEmail) {
    fields.staffContactEmail = input.contactEmail;
  } else {
    delete fields.staffContactEmail;
  }

  fields.teacherProfileSetup = {
    ...asRecord(fields.teacherProfileSetup),
    completedAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    updatedById,
    contactEmailCaptured: Boolean(input.contactEmail),
  };

  return fields as Prisma.InputJsonObject;
}
