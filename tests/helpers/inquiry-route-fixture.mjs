import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { isEligiblePublicInquiryCenter, selectPreferredInquiryCenter } from '../../src/lib/inquiry-routing.ts';
import { filterPublicInquiryLocations, isBlockedPublicInquiryIdentifier } from '../../src/lib/public-inquiry-policy.ts';
import * as locations from '../../src/lib/active-school-locations.ts';
import * as origins from '../../src/lib/inquiry-origins.ts';
import * as idempotency from '../../src/lib/inquiry-idempotency.ts';
import { normalizeInquiryProgram } from '../../src/lib/inquiry-programs.ts';

const daytona = 'Kid City USA - FL | Daytona Beach East';
const douglas = 'Kid City USA - FL | Altamonte - Douglas';
function school(id, location, aliases = []) {
  return { id, name: location, crmLocationId: location, locationId: location,
    status: 'active', email: 'fixture@example.invalid', tenantId: 'tenant_fixture',
    organization: { tenantId: 'tenant_fixture' }, customFields: { locationAliases: aliases } };
}

function compile(relativePath, dependencies, exports) {
  const original = readFileSync(relativePath, 'utf8');
  const source = original.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  const js = stripTypeScriptTypes(source, { mode: 'transform' });
  return Function(...Object.keys(dependencies), js + `\nreturn {${exports.join(',')}};`)(...Object.values(dependencies));
}

// Runs complete checked-out handlers with memory-only storage and delivery spies.
// No Prisma client, provider transport, network call, or real family is used.
export function inquiryFixture({ defaultCenterId = '', lookupFails = false, liveFails = false, emptyLive = false, genericTrial = false } = {}) {
  const centers = [school('center_daytona_fixture', daytona, ['old-daytona-form']), school('center_douglas_fixture', douglas)];
  if (genericTrial) centers.push({ ...school('center_trial_fixture', 'Example Learning Center'), crmLocationId: null, locationId: 'trial_fixture', status: 'trial' });
  const effects = { leads: /** @type {Array<{ centerId: string }>} */ ([]), deliveries: [], emails: 0, sheets: 0, writes: 0, notificationLookups: 0, unexpectedNetwork: 0 };
  const prisma = {
    tenant: { findUnique: async () => ({ id: 'tenant_fixture' }) },
    center: {
      findFirst: async ({ where }) => {
        if (lookupFails) throw new Error('synthetic lookup outage');
        return centers.find((center) => center.id === where.id) || null;
      },
      findMany: async ({ where }) => {
        if (liveFails) throw new Error('synthetic catalog outage');
        if (emptyLive) return [];
        if (!where.OR) return centers;
        return centers.filter((center) => where.OR.some((clause) => Object.entries(clause).some(([key, value]) => value.in?.includes(center[key]))));
      },
      create: async () => { effects.writes++; throw new Error('unexpected center creation'); },
    },
    organization: {
      findFirst: async () => null,
      create: async () => { effects.writes++; throw new Error('unexpected organization creation'); },
    },
    lead: { create: async ({ data }) => {
      effects.writes++; effects.leads.push(data);
      return { id: 'lead_fixture', score: data.score, stage: data.stage };
    } },
    integrationDelivery: {
      createMany: async ({ data }) => { effects.writes++; effects.deliveries.push(...data.map((row, index) => ({ id: 'delivery_' + index, ...row }))); },
      findMany: async () => effects.deliveries,
      updateMany: async () => { effects.writes++; return { count: 1 }; },
    },
    userAccessGrant: { findMany: async () => { effects.notificationLookups++; return []; } },
    staffProfile: { findMany: async () => { effects.notificationLookups++; return []; } },
  };
  class NextResponse extends Response {
    static json(body, options = {}) { return new NextResponse(JSON.stringify(body), options); }
  }
  const dependencies = {
    NextResponse, prisma, path,
    ...locations, ...origins, ...idempotency,
    filterPublicInquiryLocations, isBlockedPublicInquiryIdentifier,
    isEligiblePublicInquiryCenter, selectPreferredInquiryCenter, normalizeInquiryProgram,
    EnrollmentStage: { NEW_INQUIRY: 'NEW_INQUIRY' },
    UserRole: { CENTER_DIRECTOR: 'CENTER_DIRECTOR', ASSISTANT_DIRECTOR: 'ASSISTANT_DIRECTOR', BILLING_ADMIN: 'BILLING_ADMIN' },
    Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    process: { env: { INQUIRY_DEFAULT_CENTER_ID: defaultCenterId }, cwd: () => process.cwd() },
    readFile: async () => JSON.stringify({ locations: centers.map(locations.toPublicKidCityLocation) }),
    fetch: async () => { effects.unexpectedNetwork++; throw new Error('network is forbidden in fixture'); },
    resolveInquiryLocationNotificationEmails: ({ centerEmail }) => { effects.notificationLookups++; return centerEmail ? [centerEmail] : []; },
    claimIntegrationDeliveryForRetry: async () => ({ claimed: true, attempts: 1 }),
    computeIntegrationDeliveryState: () => ({ status: 'delivered', deliveredAt: new Date(), nextAttemptAt: null }),
    forwardInquiryToGoogleSheets: async () => { effects.sheets++; return { ok: true }; },
    sendInquiryNotificationEmail: async () => { effects.emails++; return { ok: true }; },
    checkRateLimit: () => ({ ok: true }), requestIp: () => 'synthetic', retryAfterSeconds: () => 1,
    logOperationalError: () => {}, withApiLogging: (_method, handler) => handler,
  };
  const intake = compile('src/app/api/inquiries/route.ts', dependencies, ['POST']);
  const catalog = compile('src/app/api/public/kidcity-locations/route.ts', dependencies, ['GET']);
  const base = { parentName: 'Synthetic Fixture', email: 'fixture@example.invalid', phone: '2025550100', program: 'Daycare' };
  return {
    effects, centers,
    async post(fields, { form = false, origin = 'https://kidcityusa.com' } = {}) {
      const headers = new Headers();
      if (origin) headers.set('origin', origin);
      headers.set('content-type', form ? 'application/x-www-form-urlencoded' : 'application/json');
      const payload = { ...base, ...fields };
      const body = form ? new URLSearchParams(payload) : JSON.stringify(payload);
      const response = await intake.POST(new Request('https://fixture.invalid/api/inquiries', { method: 'POST', headers, body }));
      return { status: response.status, body: await response.json() };
    },
    async get(query = '') {
      const response = await catalog.GET(new Request('https://fixture.invalid/api/public/kidcity-locations' + query));
      return { status: response.status, body: await response.json() };
    },
  };
}
