import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateSaveHarness, readWorkbench } from './billing-rate-save-harness.mjs';

const reasonError = 'Enter a reason for changing invoice timing.';

function assertSavedStateUntouched(harness) {
  for (const key of [
    'SavedRateRecords', 'PlanName', 'PlanEditorId', 'TuitionPlanId',
    'AssignmentTuitionPlanId', 'AssignmentCadence', 'AssignmentStartPeriod',
    'AssignmentDescription', 'AssignmentCredits', 'AssignmentAdditionalCharges',
    'AssignmentBillingDay', 'LastSavedTuitionDraftSignature', 'BillingAction',
  ]) {
    assert.equal(harness.state[key], undefined, `${key} must not advance before the whole save succeeds`);
  }
  assert.equal(harness.state.StatusMessage, '');
  assert.equal(harness.refreshed, 0);
}

test('valid reason with missing canonical coverage cannot save a rate or advance saved UI state', async () => {
  const coverageError = 'Resolve missing canonical biweekly invoice coverage before changing invoice timing.';
  const harness = createRateSaveHarness({
    planCadence: 'weekly',
    assignmentInvoiceDelayWeeks: '0',
    assignmentTimingReason: 'Move back to standard invoice timing',
  }, {
    assignmentResponse: { ok: false, status: 409, json: async () => ({ ok: false, error: coverageError }) },
  });
  await harness.save();
  assert.equal(harness.requests.filter(({ url }) => url === '/api/operations/records').length, 0,
    'combined saves must not issue a separately committed rate request');
  assert.equal(harness.requests.length, 1);
  assert.ok(harness.requests[0].body.tuitionPlanDraft);
  assertSavedStateUntouched(harness);
  assert.equal(harness.state.ErrorMessage, coverageError);
});

for (const reason of ['', '    ', 'four', ' four ']) {
  test(`delayed biweekly → monthly rejects short reason ${JSON.stringify(reason)} before any save`, async () => {
    const harness = createRateSaveHarness({ assignmentTimingReason: reason });
    assert.equal(harness.read('assignmentTimingChanging'), false, 'the old pre-save cadence conceals the change');
    await harness.save();
    assert.equal(harness.state.ErrorMessage, reasonError);
    assert.equal(harness.requests.length, 0, 'neither the rate nor assignment may be saved');
    assert.equal(harness.confirmations.length, 0);
  });
}

test('post-save timing reason is visible in the rate panel before saving', () => {
  const harness = createRateSaveHarness();
  assert.equal(harness.read('rateSaveTimingChanging'), true);
  assert.equal(harness.requests.length, 0);
  const source = readWorkbench();
  const start = source.indexOf('{rateSaveTimingChanging ? (');
  const end = source.indexOf(') : null}', start);
  assert.ok(start >= 0 && end > start);
  const field = source.slice(start, end);
  assert.match(field, /htmlFor="billing-rate-timing-reason"/);
  assert.match(field, /id="billing-rate-timing-reason" value=\{assignmentTimingReason\}/);
  assert.match(field, /setAssignmentTimingReason\(event.target.value\)/);
  assert.ok(source.indexOf('Tuition rate setup') < start);
  assert.ok(start < source.indexOf('Set each child’s recurring tuition'));
});

test('valid reason passes the exact server timing guard with monthly delay zero', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' });
  await harness.save();
  assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/billing/tuition-assignments']);
  const assignment = harness.requests[0].body;
  assert.deepEqual(assignment.tuitionPlanDraft, {
    id: 'synthetic-rate', centerId: 'synthetic-center', name: 'Synthetic monthly rate',
    ageGroup: 'Synthetic age group', cadence: 'monthly', amountDollars: '1000', zeroDollarVoucher: false,
  });
  assert.equal(assignment.familyId, 'synthetic-family');
  assert.equal(assignment.childId, 'synthetic-child');
  assert.equal(assignment.enabled, true);
  assert.equal(assignment.billingCadence, 'monthly');
  assert.equal(assignment.invoiceDelayWeeks, 0);
  assert.equal(assignment.billingStartPeriod, '2026-10');
  assert.equal(assignment.timingChangeReason, 'Switch to monthly tuition');
  assert.equal(harness.state.ErrorMessage, '');
  assert.match(harness.state.StatusMessage, /^Rate and recurring tuition saved/);
  assert.equal(harness.state.SavedRateRecords[0].id, 'synthetic-rate');
  assert.equal(harness.state.AssignmentTuitionPlanId, 'synthetic-rate');
  assert.equal(JSON.parse(harness.state.LastSavedTuitionDraftSignature).cadence, 'monthly');
  assert.equal(harness.refreshed, 1);
});

test('weekly rate edits preserve a delayed biweekly assignment without a reason', async () => {
  const harness = createRateSaveHarness({ planCadence: 'weekly' });
  assert.equal(harness.read('rateSaveTimingChanging'), false);
  await harness.save();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body.billingCadence, 'biweekly');
  assert.equal(harness.requests[0].body.invoiceDelayWeeks, 1);
  assert.equal(harness.requests[0].body.billingStartPeriod, '2026-W42');
  assert.equal(harness.state.ErrorMessage, '');
});

test('standard biweekly → monthly does not require an irrelevant timing reason', async () => {
  const harness = createRateSaveHarness({
    assignmentInvoiceDelayWeeks: '0',
    selectedAssignment: { cadence: 'biweekly', invoiceDelayWeeks: 0 },
  });
  assert.equal(harness.read('rateSaveTimingChanging'), false);
  await harness.save();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body.invoiceDelayWeeks, 0);
  assert.equal(harness.state.ErrorMessage, '');
});

test('ordinary biweekly timing edits still require a reason on combined saves', async () => {
  const harness = createRateSaveHarness({ planCadence: 'weekly', assignmentInvoiceDelayWeeks: '0' });
  await harness.save();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.state.ErrorMessage, reasonError);
});

for (const [scenario, overrides] of [
  ['recurring tuition disabled', { assignmentEnabled: 'false' }],
  ['no selected family', { selectedFamily: null }],
  ['no selected child', { selectedAssignmentChild: null }],
  ['past child', { selectedAssignmentChildIsCurrent: false }],
]) {
  test(`rate-only save needs no timing reason: ${scenario}`, async () => {
    const harness = createRateSaveHarness({ assignmentInvoiceDelayWeeks: '0', ...overrides });
    assert.equal(harness.read('assignmentTimingChanging'), true);
    assert.equal(harness.read('rateSaveTimingChanging'), false);
    await harness.save();
    assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/operations/records']);
    assert.equal(harness.state.ErrorMessage, '');
    assert.match(harness.state.StatusMessage, /^Rate saved\. Child tuition is not saved yet\./);
    assert.equal(harness.confirmations.length, 0);
  });
}

test('Save Tuition Assignment delegates dirty rate validation before any writes', async () => {
  const harness = createRateSaveHarness();
  await harness.save('submitAssignment');
  assert.equal(harness.state.ErrorMessage, reasonError);
  assert.equal(harness.requests.length, 0);
});

test('delegated combined save validates its final cadence, not a superseded draft cadence', async () => {
  const harness = createRateSaveHarness({ assignmentCadence: 'monthly', assignmentStartPeriod: '2026-10', planCadence: 'biweekly' });
  assert.equal(harness.read('assignmentTimingChanging'), true);
  assert.equal(harness.read('rateSaveTimingChanging'), false);
  await harness.save('submitAssignment');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body.billingCadence, 'biweekly');
  assert.equal(harness.requests[0].body.invoiceDelayWeeks, 1);
  assert.equal(harness.state.ErrorMessage, '');
});

test('assignment-only saves retain their own timing guard', async () => {
  const harness = createRateSaveHarness({ planDraftIsDirty: false, assignmentInvoiceDelayWeeks: '0' });
  await harness.save('submitAssignment');
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.state.ErrorMessage, reasonError);
});

test('cancelled confirmation produces no rate or assignment write', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { confirm: false });
  await harness.save();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.confirmations.length, 1);
});

test('existing child eligibility check still prevents writes', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { eligibilityError: 'Synthetic eligibility failure' });
  await harness.save();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.state.ErrorMessage, 'Synthetic eligibility failure');
});

test('shared-rate version creation is one atomic request and reports preserved children', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { rateConflict: true });
  await harness.save();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, '/api/billing/tuition-assignments');
  assert.equal(harness.requests[0].body.tuitionPlanDraft.id, 'synthetic-rate');
  assert.equal(harness.requests[0].body.tuitionPlanId, undefined);
  assert.equal(harness.requests[0].body.invoiceDelayWeeks, 0);
  assert.equal(harness.requests[0].body.timingChangeReason, 'Switch to monthly tuition');
  assert.equal(harness.state.PlanEditorId, 'synthetic-created-rate');
  assert.equal(harness.state.AssignmentTuitionPlanId, 'synthetic-created-rate');
  assert.equal(JSON.parse(harness.state.LastSavedTuitionDraftSignature).tuitionPlanId, 'synthetic-created-rate');
  assert.match(harness.state.StatusMessage, /Previously saved children kept their existing rates\./);
});

for (const status of [400, 401, 403, 404, 409, 500, 503]) {
  test(`atomic server rejection ${status} leaves the saved UI state untouched without a fallback request`, async () => {
    const error = `Synthetic atomic rejection ${status}`;
    const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, {
      assignmentResponse: { ok: false, status, json: async () => ({ ok: false, error }) },
    });
    await harness.save();
    assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/billing/tuition-assignments']);
    assertSavedStateUntouched(harness);
    assert.equal(harness.state.ErrorMessage, error);
  });
}

for (const [scenario, response] of [
  ['explicit failure on HTTP success', { ok: true, status: 200, json: async () => ({ ok: false, error: 'Synthetic failure' }) }],
  ['missing success acknowledgement', { ok: true, status: 200, json: async () => ({ record: { id: 'unconfirmed-rate' } }) }],
  ['malformed JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Synthetic malformed JSON'); } }],
  ['missing saved record', { ok: true, status: 200, json: async () => ({ ok: true }) }],
  ['missing saved rate ID', { ok: true, status: 200, json: async () => ({ ok: true, record: {} }) }],
]) {
  test(`incomplete atomic response: ${scenario} cannot mark either draft saved`, async () => {
    const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { assignmentResponse: response });
    await harness.save();
    assert.equal(harness.requests.length, 1);
    assertSavedStateUntouched(harness);
    assert.ok(harness.state.ErrorMessage);
  });
}

test('interrupted combined request preserves the existing billing recovery handler and unsaved drafts', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, {
    assignmentResponse: async () => { throw new Error('Synthetic network interruption'); },
  });
  await harness.save();
  assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/billing/tuition-assignments']);
  assertSavedStateUntouched(harness);
  assert.match(harness.state.ErrorMessage, /^The billing request was interrupted\. Review the current account and Stripe activity/);
});

test('pending atomic request updates no saved state until the whole response succeeds', async () => {
  let resolveResponse;
  const response = new Promise((resolve) => { resolveResponse = resolve; });
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { assignmentResponse: () => response });
  const saving = harness.save();
  await new Promise(setImmediate);
  assert.equal(harness.requests.length, 1);
  assertSavedStateUntouched(harness);
  resolveResponse({ ok: true, status: 200, json: async () => ({ ok: true, record: { id: 'atomic-saved-rate' } }) });
  await saving;
  assert.equal(harness.state.PlanEditorId, 'atomic-saved-rate');
  assert.equal(harness.state.AssignmentTuitionPlanId, 'atomic-saved-rate');
  assert.equal(harness.state.SavedRateRecords[0].id, 'atomic-saved-rate');
  assert.ok(harness.state.LastSavedTuitionDraftSignature);
  assert.equal(harness.refreshed, 1);
});

test('new dirty rate dispatches from Save Tuition Assignment into the atomic request', async () => {
  const harness = createRateSaveHarness({
    planEditorId: 'new', effectiveAssignmentPlanId: '', assignmentTimingReason: 'Switch to monthly tuition',
  });
  await harness.save('submitAssignment');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, '/api/billing/tuition-assignments');
  assert.equal(harness.requests[0].body.tuitionPlanDraft.id, undefined);
  assert.equal(harness.state.AssignmentTuitionPlanId, 'synthetic-created-rate');
  assert.equal(harness.state.ErrorMessage, '');
});

test('unchanged selected rate uses the existing assignment-only request', async () => {
  const harness = createRateSaveHarness({ planDraftIsDirty: false });
  await harness.save('submitAssignment');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, '/api/billing/tuition-assignments');
  assert.equal(harness.requests[0].body.tuitionPlanDraft, undefined);
  assert.equal(harness.requests[0].body.tuitionPlanId, 'synthetic-rate');
  assert.equal(harness.state.SavedRateRecords, undefined);
  assert.equal(harness.state.LastSavedTuitionDraftSignature, 'synthetic-signature');
});

test('rate-only shared-rate fallback still creates a new version through operations records', async () => {
  const harness = createRateSaveHarness({ assignmentEnabled: 'false' }, { rateConflict: true });
  await harness.save();
  assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/operations/records', '/api/operations/records']);
  assert.equal(harness.requests[0].body.id, 'synthetic-rate');
  assert.equal(harness.requests[1].body.id, undefined);
  assert.equal(harness.state.PlanEditorId, 'synthetic-created-rate');
  assert.equal(harness.state.LastSavedTuitionDraftSignature, undefined);
  assert.match(harness.state.StatusMessage, /^Rate saved\. Child tuition is not saved yet\./);
});

test('rate-only server error does not update saved local state', async () => {
  const harness = createRateSaveHarness({ assignmentEnabled: 'false' }, {
    rateResponse: { ok: false, status: 409, json: async () => ({ error: 'Synthetic rate conflict' }) },
  });
  await harness.save();
  assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/operations/records']);
  assertSavedStateUntouched(harness);
  assert.equal(harness.state.ErrorMessage, 'Synthetic rate conflict');
});

test('voucher combined save clears adjustments only after success and submits zero family responsibility', async () => {
  const harness = createRateSaveHarness({
    assignmentTimingReason: 'Switch to monthly tuition',
    planFundingType: 'voucher', planAmountDollars: '0.00',
    effectiveAssignmentCredits: [{ category: 'employee', amountCents: 1000 }],
    effectiveAssignmentAdditionalCharges: [{ description: 'Synthetic additional charge', amountCents: 2000 }],
  });
  await harness.save();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body.tuitionPlanDraft.zeroDollarVoucher, true);
  assert.equal(harness.requests[0].body.tuitionPlanDraft.amountDollars, '0.00');
  assert.deepEqual(harness.requests[0].body.tuitionCredits, []);
  assert.deepEqual(harness.requests[0].body.tuitionAdditionalCharges, []);
  assert.equal(harness.state.SavedRateRecords[0].amountCents, 0);
  assert.equal(Object.keys(harness.state.AssignmentCredits).length, 0);
  assert.equal(harness.state.AssignmentAdditionalCharges.length, 0);
});

test('combined save keeps a custom description and existing adjustments', async () => {
  const credits = [{ category: 'employee', amountCents: 1000 }];
  const charges = [{ description: 'Synthetic additional charge', amountCents: 2000 }];
  const harness = createRateSaveHarness({
    assignmentTimingReason: 'Switch to monthly tuition',
    effectiveAssignmentDescription: 'Custom child tuition',
    effectiveAssignmentCredits: credits, effectiveAssignmentAdditionalCharges: charges,
  });
  await harness.save();
  const assignment = harness.requests[0].body;
  assert.equal(assignment.description, 'Custom child tuition');
  assert.deepEqual(assignment.tuitionCredits, credits);
  assert.deepEqual(assignment.tuitionAdditionalCharges, charges);
  assert.equal(harness.state.AssignmentDescription, 'Custom child tuition');
  assert.equal(harness.state.AssignmentCredits.employee, '10');
});

for (const [scenario, status, code, error] of [
  ['serialization retries exhausted', 409, 'TUITION_SAVE_CONFLICT', 'Tuition changed while saving. Refresh and review the current rate and assignment before trying again.'],
  ['assigned-rate conflict', 409, 'TUITION_PLAN_ASSIGNED_CREATE_NEW', 'Synthetic assigned-rate conflict'],
  ['transaction audit failure', 500, undefined, 'Synthetic audit failure'],
]) {
  test(`${scenario} must not fall back to a separate rate write or publish saved state`, async () => {
    const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, {
      assignmentResponse: { ok: false, status, json: async () => ({ ok: false, error, code }) },
    });
    await harness.save('submitAssignment');
    assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/billing/tuition-assignments']);
    assertSavedStateUntouched(harness);
    assert.equal(harness.state.ErrorMessage, error);
  });
}

test('source-derived server timing guard retains typed validation errors', () => {
  const harness = createRateSaveHarness();
  const rejection = harness.read("validateServerTiming({ billingCadence: 'monthly', invoiceDelayWeeks: 0, timingChangeReason: 'four' })");
  assert.equal(rejection.status, 400);
  assert.equal(rejection.body.ok, false);
  assert.equal(rejection.body.error, reasonError);
});
