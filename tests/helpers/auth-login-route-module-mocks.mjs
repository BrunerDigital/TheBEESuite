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
  namedExports: {
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
  namedExports: {
    async verifySupabaseLogin({ email }) {
      state.passwordChecks.push(email);
      return state.loginResult ?? { status: "verified" };
    },
  },
});

mock.module("@/lib/rate-limit", {
  namedExports: {
    async checkPersistentRateLimit({ key }) {
      if (key === state.blockedRateKey) return { ok: false, resetAt: Date.now() + 60_000 };
      return { ok: true };
    },
    requestIp(headers) {
      return headers.get("x-test-ip") || "203.0.113.10";
    },
    retryAfterSeconds() {
      return 60;
    },
  },
});

mock.module("@/lib/auth", {
  namedExports: {
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
  namedExports: {
    resolveLoginIdentifier(value) {
      return value;
    },
  },
});

mock.module("@/lib/login-routing", {
  namedExports: {
    resolvePortalPostLoginPath() {
      return "/parent-portal";
    },
  },
});

mock.module("@/lib/device-sessions", {
  namedExports: {
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
  namedExports: {
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

test("MFA challenges and failures never create application or device sessions", async () => {
  for (const status of ["mfa_required", "invalid_code", "unavailable", "unsupported_factor", "invalid_password"]) {
    state.loginResult = { status, factors: [{ id: "synthetic-factor", label: "Authenticator" }] };
    const before = { devices: state.deviceSessionCreates, tokens: state.sessionTokensCreated, audits: state.auditLogCreates };
    const response = await POST(new Request("https://app.test/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "inactive@example.com", password: "synthetic", mfaCode: "123456" }),
    }));
    assert.equal(response.status, status === "unavailable" || status === "unsupported_factor" ? 503 : 401);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.deepEqual({ devices: state.deviceSessionCreates, tokens: state.sessionTokensCreated, audits: state.auditLogCreates }, before);
    if (status === "mfa_required" || status === "invalid_code") {
      assert.equal((await response.json()).requiresMfa, true);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  state.loginResult = undefined;
});

test("a fully verified active account receives its application session", async () => {
  applicationUsers.set("active@example.com", { ...applicationUsers.get("inactive@example.com"), id: "active-user", email: "active@example.com", isActive: true });
  state.loginResult = { status: "verified" };
  const before = state.sessionTokensCreated;
  const response = await POST(new Request("https://app.test/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "active@example.com", password: "synthetic", mfaCode: "123456" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(state.sessionTokensCreated, before + 1);
  assert.equal(response.headers.has("set-cookie"), true);
  state.loginResult = undefined;
});

test("one client's MFA rate limit cannot lock out another client's login", async () => {
  state.blockedRateKey = "login-mfa:203.0.113.10:active@example.com";
  state.loginResult = { status: "mfa_required", factors: [{ id: "factor", label: "Authenticator" }] };
  for (const [ip, expectedStatus] of [["203.0.113.10", 429], ["203.0.113.11", 401]]) {
    const response = await POST(new Request("https://app.test/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json", "x-test-ip": ip },
      body: JSON.stringify({ email: "active@example.com", password: "synthetic", mfaCode: "123456" }),
    }));
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.has("set-cookie"), false);
  }
  state.blockedRateKey = undefined;
  state.loginResult = undefined;
});
