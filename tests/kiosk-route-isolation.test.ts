import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { POST as checkInOut } from "@/app/api/kiosk/check/route";
import { POST as lookupFamily } from "@/app/api/kiosk/lookup/route";
import { createGuardianQrToken, hashGuardianPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";

type AsyncMethod = (...args: unknown[]) => Promise<unknown>;
type MockableDelegate = Record<string, AsyncMethod>;

function delegate(value: unknown) {
  return value as MockableDelegate;
}

function mockPrismaMethod(t: TestContext, value: unknown, methodName: string, implementation: AsyncMethod) {
  const target = delegate(value);
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, methodName);
  const mocked = t.mock.fn(implementation);
  target[methodName] = mocked;
  t.after(() => {
    if (originalDescriptor) Object.defineProperty(target, methodName, originalDescriptor);
    else Reflect.deleteProperty(target, methodName);
  });
  return mocked;
}

function restoreEnvironment(name: string, original: string | undefined) {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

function kioskRequest(path: string, body: Record<string, unknown>) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(t: TestContext) {
  mockPrismaMethod(t, prisma.rateLimitBucket, "findUnique", async () => null);
  mockPrismaMethod(t, prisma.rateLimitBucket, "upsert", async () => ({}));
}

function selectedChildWhere(args: unknown[]) {
  const query = args[0] as {
    include?: {
      family?: {
        select?: {
          children?: { where?: unknown };
        };
      };
    };
  };
  return query.include?.family?.select?.children?.where;
}

function activeCenter() {
  return {
    id: "center-a",
    name: "Center A",
    email: null,
    crmLocationId: null,
    city: null,
    state: null,
    postalCode: null,
    timezone: "America/New_York",
    customFields: {},
    organization: { tenantId: "tenant-a" },
  };
}

test("family kiosk lookup rejects a QR credential issued by another center before guardian data is queried", async (t) => {
  const originalPinSecret = process.env.PIN_HASH_SECRET;
  const originalRequestLogging = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.PIN_HASH_SECRET = "kiosk-route-isolation-test-secret";
  process.env.REQUEST_RESPONSE_LOGGING = "off";

  try {
    const pinHash = hashGuardianPin("guardian-a", "1234");
    const qrToken = createGuardianQrToken({
      centerId: "center-a",
      guardianId: "guardian-a",
      checkInPinSetAt: new Date("2026-08-10T12:00:00.000Z"),
      checkInPinHash: pinHash,
    });
    assert.ok(qrToken);

    mockRateLimit(t);
    mockPrismaMethod(t, prisma.center, "findFirst", async () => ({
      id: "center-b",
      name: "Center B",
      crmLocationId: null,
      city: null,
      state: null,
      postalCode: null,
      timezone: "America/New_York",
      customFields: {},
    }));
    const guardianLookup = mockPrismaMethod(
      t,
      prisma.guardian,
      "findFirst",
      async () => {
        throw new Error("Cross-center QR lookup must fail before reading a guardian.");
      },
    );
    const attendanceLookup = mockPrismaMethod(
      t,
      prisma.checkInOutLog,
      "findMany",
      async () => {
        throw new Error("Rejected credentials must not read attendance data.");
      },
    );

    const response = await lookupFamily(kioskRequest("/api/kiosk/lookup", {
      centerId: "center-b",
      qrToken,
    }) as never);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "QR code was not recognized for this school.",
    });
    assert.equal(guardianLookup.mock.callCount(), 0);
    assert.equal(attendanceLookup.mock.callCount(), 0);
  } finally {
    restoreEnvironment("PIN_HASH_SECRET", originalPinSecret);
    restoreEnvironment("REQUEST_RESPONSE_LOGGING", originalRequestLogging);
  }
});

test("family kiosk check rejects a child from another family before attendance or audit writes", async (t) => {
  const originalPinSecret = process.env.PIN_HASH_SECRET;
  const originalRequestLogging = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.PIN_HASH_SECRET = "kiosk-route-isolation-test-secret";
  process.env.REQUEST_RESPONSE_LOGGING = "off";

  try {
    const guardianId = "guardian-a";
    const pin = "1234";
    const checkInPinHash = hashGuardianPin(guardianId, pin);

    mockRateLimit(t);
    mockPrismaMethod(t, prisma.center, "findFirst", async () => ({
      id: "center-a",
      name: "Center A",
      email: null,
      crmLocationId: null,
      city: null,
      state: null,
      postalCode: null,
      timezone: "America/New_York",
      customFields: {},
      organization: { tenantId: "tenant-a" },
    }));
    mockPrismaMethod(t, prisma.guardian, "findMany", async () => ([{
      id: guardianId,
      fullName: "Parent A",
      relation: "Parent",
      checkInPinHash,
      checkInPinSetAt: new Date("2026-08-10T12:00:00.000Z"),
      family: {
        id: "family-a",
        name: "Family A",
        custodyNotes: null,
        children: [{
          id: "child-a",
          fullName: "Child A",
          classroom: { id: "classroom-a", centerId: "center-a" },
        }],
      },
    }]));
    const attendanceLookup = mockPrismaMethod(
      t,
      prisma.checkInOutLog,
      "findMany",
      async () => {
        throw new Error("Rejected child selection must not read attendance data.");
      },
    );
    const transaction = mockPrismaMethod(
      t,
      prisma,
      "$transaction",
      async () => {
        throw new Error("Rejected child selection must not open a write transaction.");
      },
    );
    const auditWrite = mockPrismaMethod(
      t,
      prisma.auditLog,
      "create",
      async () => {
        throw new Error("Rejected child selection must not write an audit record.");
      },
    );

    const response = await checkInOut(kioskRequest("/api/kiosk/check", {
      centerId: "center-a",
      pin,
      type: "check_in",
      childIds: ["child-a", "child-from-family-b"],
      signatureName: "Parent A",
    }) as never);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "One or more selected children are not linked to this guardian at this school.",
      unauthorizedChildIds: ["child-from-family-b"],
    });
    assert.equal(attendanceLookup.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(auditWrite.mock.callCount(), 0);
  } finally {
    restoreEnvironment("PIN_HASH_SECRET", originalPinSecret);
    restoreEnvironment("REQUEST_RESPONSE_LOGGING", originalRequestLogging);
  }
});

test("family kiosk check rejects an unassigned same-family child before attendance or audit writes", async (t) => {
  const originalPinSecret = process.env.PIN_HASH_SECRET;
  const originalRequestLogging = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.PIN_HASH_SECRET = "kiosk-route-isolation-test-secret";
  process.env.REQUEST_RESPONSE_LOGGING = "off";

  try {
    const guardianId = "guardian-a";
    const pin = "1234";
    const checkInPinHash = hashGuardianPin(guardianId, pin);

    mockRateLimit(t);
    mockPrismaMethod(t, prisma.center, "findFirst", async () => activeCenter());
    mockPrismaMethod(t, prisma.guardian, "findMany", async () => ([{
      id: guardianId,
      fullName: "Parent A",
      relation: "Parent",
      checkInPinHash,
      checkInPinSetAt: new Date("2026-08-10T12:00:00.000Z"),
      family: {
        id: "family-a",
        name: "Family A",
        custodyNotes: null,
        children: [{
          id: "child-unassigned",
          fullName: "Child Unassigned",
          classroom: null,
        }],
      },
    }]));
    const attendanceLookup = mockPrismaMethod(t, prisma.checkInOutLog, "findMany", async () => {
      throw new Error("Unassigned children must fail before attendance is read.");
    });
    const transaction = mockPrismaMethod(t, prisma, "$transaction", async () => {
      throw new Error("Unassigned children must fail before a write transaction opens.");
    });
    const auditWrite = mockPrismaMethod(t, prisma.auditLog, "create", async () => {
      throw new Error("Unassigned children must fail before an audit record is written.");
    });

    const response = await checkInOut(kioskRequest("/api/kiosk/check", {
      centerId: "center-a",
      pin,
      type: "check_in",
      childIds: ["child-unassigned"],
      signatureName: "Parent A",
    }) as never);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "No selected children are linked to this guardian at this school.",
    });
    assert.equal(attendanceLookup.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(auditWrite.mock.callCount(), 0);
  } finally {
    restoreEnvironment("PIN_HASH_SECRET", originalPinSecret);
    restoreEnvironment("REQUEST_RESPONSE_LOGGING", originalRequestLogging);
  }
});

test("family kiosk check filters inactive children before attendance or audit writes", async (t) => {
  const originalPinSecret = process.env.PIN_HASH_SECRET;
  const originalRequestLogging = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.PIN_HASH_SECRET = "kiosk-route-isolation-test-secret";
  process.env.REQUEST_RESPONSE_LOGGING = "off";

  try {
    const guardianId = "guardian-a";
    const pin = "1234";
    const checkInPinHash = hashGuardianPin(guardianId, pin);

    mockRateLimit(t);
    mockPrismaMethod(t, prisma.center, "findFirst", async () => activeCenter());
    mockPrismaMethod(t, prisma.guardian, "findMany", async (...args) => {
      assert.deepEqual(selectedChildWhere(args), {
        id: { in: ["child-inactive"] },
        enrollmentStatus: { in: ["enrolled", "active", "current"] },
        classroomId: { not: null },
      });
      return [{
        id: guardianId,
        fullName: "Parent A",
        relation: "Parent",
        checkInPinHash,
        checkInPinSetAt: new Date("2026-08-10T12:00:00.000Z"),
        family: {
          id: "family-a",
          name: "Family A",
          custodyNotes: null,
          children: [],
        },
      }];
    });
    const attendanceLookup = mockPrismaMethod(t, prisma.checkInOutLog, "findMany", async () => {
      throw new Error("Inactive children must fail before attendance is read.");
    });
    const transaction = mockPrismaMethod(t, prisma, "$transaction", async () => {
      throw new Error("Inactive children must fail before a write transaction opens.");
    });
    const auditWrite = mockPrismaMethod(t, prisma.auditLog, "create", async () => {
      throw new Error("Inactive children must fail before an audit record is written.");
    });

    const response = await checkInOut(kioskRequest("/api/kiosk/check", {
      centerId: "center-a",
      pin,
      type: "check_in",
      childIds: ["child-inactive"],
      signatureName: "Parent A",
    }) as never);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "No selected children are linked to this guardian at this school.",
    });
    assert.equal(attendanceLookup.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(auditWrite.mock.callCount(), 0);
  } finally {
    restoreEnvironment("PIN_HASH_SECRET", originalPinSecret);
    restoreEnvironment("REQUEST_RESPONSE_LOGGING", originalRequestLogging);
  }
});

test("family kiosk check allows an enrolled same-center child", async (t) => {
  const originalPinSecret = process.env.PIN_HASH_SECRET;
  const originalRequestLogging = process.env.REQUEST_RESPONSE_LOGGING;
  process.env.PIN_HASH_SECRET = "kiosk-route-isolation-test-secret";
  process.env.REQUEST_RESPONSE_LOGGING = "off";

  try {
    const guardianId = "guardian-a";
    const pin = "1234";
    const checkInPinHash = hashGuardianPin(guardianId, pin);

    mockRateLimit(t);
    mockPrismaMethod(t, prisma.center, "findFirst", async () => activeCenter());
    mockPrismaMethod(t, prisma.guardian, "findMany", async (...args) => {
      assert.deepEqual(selectedChildWhere(args), {
        id: { in: ["child-a"] },
        enrollmentStatus: { in: ["enrolled", "active", "current"] },
        classroomId: { not: null },
      });
      return [{
        id: guardianId,
        fullName: "Parent A",
        relation: "Parent",
        checkInPinHash,
        checkInPinSetAt: new Date("2026-08-10T12:00:00.000Z"),
        family: {
          id: "family-a",
          name: "Family A",
          custodyNotes: null,
          children: [{
            id: "child-a",
            fullName: "Child A",
            classroom: { id: "classroom-a", centerId: "center-a" },
          }],
        },
      }];
    });
    mockPrismaMethod(t, prisma.checkInOutLog, "findMany", async () => []);
    const transaction = mockPrismaMethod(t, prisma, "$transaction", async () => ([{ id: "log-a" }]));
    const auditWrite = mockPrismaMethod(t, prisma.auditLog, "create", async () => ({ id: "audit-a" }));

    const response = await checkInOut(kioskRequest("/api/kiosk/check", {
      centerId: "center-a",
      pin,
      type: "check_in",
      childIds: ["child-a"],
      signatureName: "Parent A",
    }) as never);
    const body = await response.json() as {
      ok: boolean;
      action: string;
      children: Array<{ id: string; fullName: string }>;
    };

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.action, "check_in");
    assert.deepEqual(body.children, [{ id: "child-a", fullName: "Child A" }]);
    assert.equal(transaction.mock.callCount(), 1);
    assert.equal(auditWrite.mock.callCount(), 1);
  } finally {
    restoreEnvironment("PIN_HASH_SECRET", originalPinSecret);
    restoreEnvironment("REQUEST_RESPONSE_LOGGING", originalRequestLogging);
  }
});
