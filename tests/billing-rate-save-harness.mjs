import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

export const defaultSourceRoot = resolve(import.meta.dirname, '../src');
export const sourceRoot = process.env.BILLING_UI_SOURCE_ROOT || defaultSourceRoot;

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Missing source markers: ${startMarker} / ${endMarker}`);
  return source.slice(start, end);
}

function script(source) {
  return stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export /gm, '');
}

export function readWorkbench(root = sourceRoot) {
  return readFileSync(resolve(root, 'components/billing-workbench.tsx'), 'utf8');
}

// Runs the actual source-derived render calculations and nested save handlers.
// React setters, browser confirmation, and both HTTP endpoints are in-memory stubs.
// This is not React rendering, a live request, or a full API-route test.
export function createRateSaveHarness(overrides = {}, options = {}) {
  const root = options.root || sourceRoot;
  const workbench = readWorkbench(root);
  const requests = [];
  const confirmations = [];
  const state = {};
  const transitions = [];
  let refreshed = 0;
  const selectedAssignment = { cadence: 'biweekly', invoiceDelayWeeks: 1, startsPeriod: '2026-W42', tuitionPlanId: 'synthetic-rate' };
  const context = createContext({
    billingRequestInFlight: { current: false },
    billingViewActive: { current: true },
    selectedFamily: { id: 'synthetic-family' },
    selectedAssignmentChild: { id: 'synthetic-child', fullName: 'Synthetic Child' },
    selectedAssignmentChildIsCurrent: true,
    selectedAssignment,
    assignmentEnabled: 'true',
    assignmentCadence: 'biweekly',
    assignmentStartPeriod: '2026-W42',
    assignmentInvoiceDelayWeeks: '1',
    assignmentTimingReason: '',
    assignmentBillingDay: '5',
    planCadence: 'monthly',
    planBeingEdited: { archived: false },
    planName: 'Synthetic monthly rate',
    planAmountDollars: '1000',
    planFundingType: 'family',
    planEditorId: 'synthetic-rate',
    planAgeGroup: 'Synthetic age group',
    planDraftIsDirty: true,
    centerId: 'synthetic-center',
    effectiveAssignmentPlanId: 'synthetic-rate',
    effectiveAssignmentPlan: { name: 'Synthetic weekly rate' },
    effectiveAssignmentDescription: 'Synthetic weekly rate',
    effectiveAssignmentCreditsTotalCents: 0,
    effectiveAssignmentAdditionalChargesTotalCents: 0,
    effectiveAssignmentCredits: [],
    effectiveAssignmentAdditionalCharges: [],
    effectiveAssignmentGrossCents: 100000,
    effectiveAssignmentNetCents: 100000,
    assignmentIsVoucherFunded: false,
    assignmentTuitionDraftSignature: 'synthetic-signature',
    currentPeriodForCadence: (cadence) => cadence === 'monthly' ? '2026-10' : '2026-W42',
    dollarsToCents: (value) => Math.round(Number(value) * 100),
    childTuitionEligibilityError: () => options.eligibilityError || null,
    tuitionCreditInputs: (credits) => Object.fromEntries(credits.map((entry) => [entry.category, String(entry.amountCents / 100)])),
    tuitionAdditionalChargeInputs: (charges) => charges,
    money: (cents) => `$${(cents / 100).toFixed(2)}`,
    confirmBillingAction: (...args) => { confirmations.push(args); return options.confirm !== false; },
    startTransition: (action) => { transitions.push(Promise.resolve().then(action)); },
    router: { refresh: () => { refreshed++; } },
    ...overrides,
  });
  context.effectiveAssignmentCadence = context.assignmentCadence;
  context.effectiveAssignmentStartPeriod = context.assignmentStartPeriod;
  context.effectiveAssignmentBillingDay = context.assignmentCadence === 'monthly' ? context.assignmentBillingDay : '4';
  for (const name of [
    'ErrorMessage', 'StatusMessage', 'SavedRateRecords', 'PlanName', 'PlanEditorId',
    'TuitionPlanId', 'AssignmentTuitionPlanId', 'AssignmentCadence', 'AssignmentStartPeriod',
    'AssignmentDescription', 'AssignmentCredits', 'AssignmentAdditionalCharges',
    'AssignmentBillingDay', 'LastSavedTuitionDraftSignature', 'BillingAction',
  ]) {
    context[`set${name}`] = (value) => { state[name] = typeof value === 'function' ? value(state[name] || []) : value; };
  }
  for (const filename of ['billing-workflows.ts', 'tuition-rate-schedule.ts', 'tuition-invoice-timing.ts']) {
    runInContext(script(readFileSync(resolve(root, 'lib', filename), 'utf8')), context, { filename });
  }
  // Exact timing-validation section from the source route, not a handwritten
  // replacement predicate. It intentionally does not simulate coverage checks,
  // transactions, notifications, authorization, or other server behavior.
  const routePath = options.routePath || process.env.BILLING_TIMING_GUARD_ROUTE || resolve(root, 'app/api/billing/tuition-assignments/route.ts');
  const route = readFileSync(routePath, 'utf8');
  const timingGuard = between(route, '  const previousCadenceValue =', '  const cadenceChanging =');
  runInContext(script(`
    function validateServerTiming(body) {
      const cadence = body.billingCadence;
      const existingFields = {
        tuitionBillingCadence: selectedAssignment?.cadence,
        tuitionBillingInvoiceDelayWeeks: selectedAssignment?.invoiceDelayWeeks,
      };
      const NextResponse = { json: (body, init) => ({ body, status: init.status }) };
      class TimingValidationError extends Error {
        constructor(status, message) { super(message); this.status = status; }
      }
      const tuitionMutationFailure = (status, message) => { throw new TimingValidationError(status, message); };
      try {
        ${timingGuard}
        return null;
      } catch (error) {
        if (error instanceof TimingValidationError) {
          return { body: { ok: false, error: error.message }, status: error.status };
        }
        throw error;
      }
    }
  `), context);
  context.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (url === '/api/operations/records') {
      if (options.rateResponse) return options.rateResponse;
      if (options.rateConflict && body.id) {
        return { ok: false, status: 409, json: async () => ({ code: 'TUITION_PLAN_ASSIGNED_CREATE_NEW' }) };
      }
      return { ok: true, status: 200, json: async () => ({ record: { id: body.id || 'synthetic-created-rate' } }) };
    }
    assert.equal(url, '/api/billing/tuition-assignments');
    const rejection = context.validateServerTiming(body);
    if (!rejection && options.assignmentResponse) {
      return typeof options.assignmentResponse === 'function'
        ? options.assignmentResponse(body)
        : options.assignmentResponse;
    }
    return rejection
      ? { ok: false, status: rejection.status, json: async () => rejection.body }
      : { ok: true, status: 200, json: async () => ({
        ok: true,
        ...(body.tuitionPlanDraft ? {
          record: { id: (!options.rateConflict && body.tuitionPlanDraft.id) || 'synthetic-created-rate' },
          rateVersionCreated: Boolean(options.rateConflict && body.tuitionPlanDraft.id),
        } : {}),
      }) };
  };
  const transitionFunction = between(workbench, '  function runBillingTransition(', '  const scopedFamilies =');
  const calculations = between(workbench, '  const effectiveAssignmentInvoiceDelayWeeks =', '  const nextAssignmentInvoiceDate =');
  const saveFunction = between(workbench, '  function saveTuitionPlan() {', '  function changeTuitionPlanArchive() {');
  const assignmentFunction = between(workbench, '  function submitAssignment() {', '  function handlePlanEditorChange(');
  runInContext(script(transitionFunction + calculations + saveFunction + assignmentFunction), context);
  return {
    requests, confirmations, state,
    read: (expression) => runInContext(expression, context),
    get refreshed() { return refreshed; },
    async save(method = 'saveTuitionPlan') {
      context[method]();
      await Promise.all(transitions);
    },
  };
}
