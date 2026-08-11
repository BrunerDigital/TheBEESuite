import assert from "node:assert/strict";
import { mock, test } from "node:test";

const state = {
  passwordChecks: [],
  userLookups: [],
  deviceSessionCreates: 0,
  auditLogCreates: 0,
  sessionTokensCreated: 0,
};

const applicationUsers = new Map([
  [
    "inactive@example.com",
    {
      id: "inactive-user",
      tenantId: "tenant-test",
      email: "inactive@example.com",
      name: "Inactive Parent",
      role: "PARENT_GUARDIAN",
      mustResetPassword: false,
      sessionVersion: 0,
      isActive: false,
    },
  ],
]);

mock.module("@/lib/prisma", {
  exports: {
    prisma: {
      user: {
        async findFirst(args) {
          state.userLookups.push(args);
          const record = applicationUsers.get(args.where.email);
          if (!record) return null;
          if (
            Object.hasOwn(args.where, "isActive") &&
            record.isActive !== args.where.isActive
          ) {
            return null;
          }
          return record;
        },
      },
      deviceSession: {
        async create() {
          state.deviceSessionCreates += 1;
          return { id: "unexpected-device-session", label: "Unexpected" };
        },
      },
      auditLog: {
        async create() {
          state.auditLogCreates += 1;
          return { id: "unexpected-audit-log" };
        },
      },
    },
  },
});

mock.module("@/lib/supabase-auth", {
  exports: {
    async verifySupabasePassword(email) {
      state.passwordChecks.push(email);
      return true;
    },
  },
});

mock.module("@/lib/rate-limit", {
  exports: {
    async checkPersistentRateLimit() {
      return { ok: true };
    },
    requestIp() {
      return "203.0.113.10";
    },
    retryAfterSeconds() {
      return 60;
    },
  },
});

mock.module("@/lib/auth", {
  exports: {
    SESSION_COOKIE: "bee_suite_session",
    createSessionToken() {
      state.sessionTokensCreated += 1;
      return "unexpected-session-token";
    },
    requiresPasswordResetGate() {
      return false;
    },
    sessionCookieOptions() {
      return {};
    },
  },
});

mock.module("@/lib/demo-accounts", {
  exports: {
    resolveLoginIdentifier(value) {
      return value;
    },
  },
});

mock.module("@/lib/login-routing", {
  exports: {
    resolvePortalPostLoginPath() {
      return "/parent-portal";
    },
  },
});

mock.module("@/lib/device-sessions", {
  exports: {
    buildDeviceSessionLabel() {
      return "Test device";
    },
    cleanDeviceLabel(value) {
      return String(value ?? "").trim();
    },
    cleanUserAgent(value) {
      return String(value ?? "").trim();
    },
    inferDeviceType() {
      return "desktop";
    },
    normalizeDeviceAppMode() {
      return "web";
    },
  },
});

mock.module("@/lib/request-response-logging", {
  exports: {
    withApiLogging(_method, handler) {
      return handler;
    },
  },
});

const { POST } = await import("../../src/app/api/auth/login/route.ts");

async function assertDeniedWithoutSession(email) {
  const before = {
    deviceSessionCreates: state.deviceSessionCreates,
    auditLogCreates: state.auditLogCreates,
    sessionTokensCreated: state.sessionTokensCreated,
  };
  const response = await POST(
    new Request("https://app.test/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Auth route negative test",
      },
      body: JSON.stringify({
        email,
        password: "accepted-by-supabase",
        loginPortal: "parents",
        next: "/parent-portal",
      }),
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "This account is not active in The BEE Suite.",
  });
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(state.deviceSessionCreates, before.deviceSessionCreates);
  assert.equal(state.auditLogCreates, before.auditLogCreates);
  assert.equal(state.sessionTokensCreated, before.sessionTokensCreated);
  assert.ok(state.passwordChecks.includes(email));
  assert.ok(
    state.userLookups.some(
      (lookup) => lookup.where.email === email && lookup.where.isActive === true,
    ),
  );
}

test("denies password-authenticated identity missing from the application database", async () => {
  await assertDeniedWithoutSession("missing@example.com");
});

test("denies password-authenticated identity whose application user is inactive", async () => {
  await assertDeniedWithoutSession("inactive@example.com");
});
