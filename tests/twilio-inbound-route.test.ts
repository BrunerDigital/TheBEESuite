import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { Prisma, type PrismaClient } from "@prisma/client";

test("inbound SMS verifies commands, updates consent once, and keeps HELP out of school messages", async (t) => {
  const globals = globalThis as unknown as { prisma?: PrismaClient };
  const previousPrisma = globals.prisma;
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousBase = process.env.TWILIO_WEBHOOK_BASE_URL;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const token = "local_test_token";
  const url = "https://example.test/api/twilio/inbound";
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.TWILIO_WEBHOOK_BASE_URL = "https://example.test";
  delete process.env.NEXT_PUBLIC_APP_URL;
  t.after(() => {
    globals.prisma = previousPrisma;
    for (const [key, value] of Object.entries({ TWILIO_AUTH_TOKEN: previousToken, TWILIO_WEBHOOK_BASE_URL: previousBase, NEXT_PUBLIC_APP_URL: previousAppUrl })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const receipts = new Set<string>();
  const purposes: string[] = [];
  const guardianUpdates: Array<{ customFields: { notificationPreferences: { sms: boolean } } }> = [];
  const messages: Array<{ body: string }> = [];
  let guardianLookups = 0;
  let centerId: string | null = null;
  let recipientBlocked = false;
  const notifications: Array<{ userId: string; dedupeKey: string; body: string }> = [];
  const lockOrder: string[] = [];
  const tx = {
    integrationDelivery: {
      create: async ({ data }: { data: { providerMessageId: string; purpose: string } }) => {
        receipts.add(data.providerMessageId);
        purposes.push(data.purpose);
        return { id: data.providerMessageId };
      },
      update: async () => ({}),
    },
    guardian: {
      update: async ({ data }: { data: (typeof guardianUpdates)[number] }) => { guardianUpdates.push(data); return {}; },
    },
    notificationPreference: { upsert: async () => ({}) },
    userAccessGrant: { findMany: async () => [] },
    staffProfile: { findMany: async () => ["director-2", "director-1"].map(id => ({ user: { id, email: `${id}@example.test`, role: "CENTER_DIRECTOR", staffProfile: { phone: null } } })) },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ isActive: true, customFields: { messageBlocks: { "user-test": recipientBlocked && where.id === "director-1" } } }) },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) { const query = Prisma.sql(strings, ...values); assert.match(query.text, /FOR UPDATE/); lockOrder.push(query.values[0] as string); return [{ id: query.values[0] }]; },
    notification: { create: async ({ data }: { data: (typeof notifications)[number] }) => { notifications.push(data); return data; } },
    message: {
      create: async ({ data }: { data: (typeof messages)[number] }) => { messages.push(data); return { id: `message-test-${messages.length}` }; },
    },
  };
  globals.prisma = {
    integrationCredential: { findMany: async () => [] },
    integrationDelivery: { findUnique: async ({ where }: { where: { provider_providerMessageId: { providerMessageId: string } } }) => receipts.has(where.provider_providerMessageId.providerMessageId) ? { id: "receipt" } : null },
    guardian: {
      findMany: async () => {
        guardianLookups++;
        return [{ id: "guardian-test", userId: "user-test", email: "guardian@example.test", phone: "+15555550123", customFields: {}, user: { id: "user-test", tenantId: "tenant-test" }, family: { id: "family-test", name: "Test family", centerId } }];
      },
    },
    center: { findMany: async () => [{ id: "center-test", organization: { tenantId: "tenant-test" } }] },
    auditLog: { create: async () => ({}) },
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
  } as unknown as PrismaClient;
  const { POST } = await import("../src/app/api/twilio/inbound/route");
  const request = (params: Record<string, string>, signed = true) => {
    const signaturePayload = Object.keys(params).sort().reduce((result, key) => `${result}${key}${params[key]}`, url);
    const signature = signed ? createHmac("sha1", token).update(signaturePayload).digest("base64") : "invalid";
    return new NextRequest(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature }, body: new URLSearchParams(params) });
  };
  const base = { From: "+15555550123", To: "+15555550124" };

  const unsigned = await POST(request({ ...base, MessageSid: "SMunsigned", Body: "START", OptOutType: "START" }, false));
  assert.equal(unsigned.status, 403);
  assert.equal(guardianLookups, 0);
  assert.equal(guardianUpdates.length, 0);

  const stop = { ...base, MessageSid: "SMstop", Body: "BAJA", OptOutType: "STOP" };
  assert.equal((await POST(request(stop))).status, 200);
  assert.equal(guardianUpdates[0]?.customFields.notificationPreferences.sms, false);
  assert.equal(messages.length, 0);
  assert.equal((await POST(request(stop))).status, 200);
  assert.equal(guardianUpdates.length, 1);

  assert.equal((await POST(request({ ...base, MessageSid: "SMstart", Body: "ALTA", OptOutType: "START" }))).status, 200);
  assert.equal(guardianUpdates[1]?.customFields.notificationPreferences.sms, true);

  const lookupsBeforeHelp = guardianLookups;
  for (const params of [{ Body: "AYUDA", OptOutType: "HELP" }, { Body: "INFO" }]) {
    const response = await POST(request({ ...base, MessageSid: "SMhelp", ...params } as Record<string, string>));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
  assert.equal(guardianLookups, lookupsBeforeHelp);
  assert.equal(messages.length, 0);
  assert.equal(guardianUpdates.length, 2);

  assert.equal((await POST(request({ ...base, MessageSid: "SMnormal", Body: "help with pickup" }))).status, 200);
  assert.equal(messages[0]?.body, "help with pickup");
  assert.deepEqual(purposes, ["sms_opt_out", "sms_opt_in", "sms_inbound"]);

  centerId = "center-test"; recipientBlocked = true;
  assert.equal((await POST(request({ ...base, MessageSid: "SMblocked", Body: "Synthetic SMS" }))).status, 200);
  assert.equal(messages.length, 2); // Preserve school records; suppress only blocked copies.
  assert.deepEqual(lockOrder, ["director-1", "director-2"]);
  assert.deepEqual(notifications.map(row => row.userId), ["director-2"]);
  assert.equal(notifications[0].dedupeKey, "message-sender:user-test:message-test-2:director-2");
  assert.equal(notifications[0].body, "Test family: Synthetic SMS");
  assert.equal((await POST(request({ ...base, MessageSid: "SMblocked", Body: "Synthetic SMS" }))).status, 200);
  assert.equal(notifications.length, 1); // Provider retries cannot duplicate copies.
  recipientBlocked = false;
  assert.equal((await POST(request({ ...base, MessageSid: "SMunblocked", Body: "Synthetic follow-up" }))).status, 200);
  assert.deepEqual(notifications.slice(1).map(row => row.userId), ["director-1", "director-2"]);
});
