import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateSaveHarness, readWorkbench } from './billing-rate-save-harness.mjs';

const reasonError = 'Enter a reason for changing invoice timing.';

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
  assert.deepEqual(harness.requests.map(({ url }) => url), ['/api/operations/records', '/api/billing/tuition-assignments']);
  const assignment = harness.requests[1].body;
  assert.equal(assignment.billingCadence, 'monthly');
  assert.equal(assignment.invoiceDelayWeeks, 0);
  assert.equal(assignment.billingStartPeriod, '2026-10');
  assert.equal(assignment.timingChangeReason, 'Switch to monthly tuition');
  assert.equal(harness.state.ErrorMessage, '');
  assert.match(harness.state.StatusMessage, /^Rate and recurring tuition saved/);
});

test('weekly rate edits preserve a delayed biweekly assignment without a reason', async () => {
  const harness = createRateSaveHarness({ planCadence: 'weekly' });
  assert.equal(harness.read('rateSaveTimingChanging'), false);
  await harness.save();
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.billingCadence, 'biweekly');
  assert.equal(harness.requests[1].body.invoiceDelayWeeks, 1);
  assert.equal(harness.requests[1].body.billingStartPeriod, '2026-W42');
  assert.equal(harness.state.ErrorMessage, '');
});

test('standard biweekly → monthly does not require an irrelevant timing reason', async () => {
  const harness = createRateSaveHarness({
    assignmentInvoiceDelayWeeks: '0',
    selectedAssignment: { cadence: 'biweekly', invoiceDelayWeeks: 0 },
  });
  assert.equal(harness.read('rateSaveTimingChanging'), false);
  await harness.save();
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.invoiceDelayWeeks, 0);
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
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.billingCadence, 'biweekly');
  assert.equal(harness.requests[1].body.invoiceDelayWeeks, 1);
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

test('shared-rate conflict fallback preserves the validated assignment payload', async () => {
  const harness = createRateSaveHarness({ assignmentTimingReason: 'Switch to monthly tuition' }, { rateConflict: true });
  await harness.save();
  assert.equal(harness.requests.length, 3);
  assert.equal(harness.requests[0].body.id, 'synthetic-rate');
  assert.equal(harness.requests[1].body.id, undefined);
  assert.equal(harness.requests[2].body.tuitionPlanId, 'synthetic-created-rate');
  assert.equal(harness.requests[2].body.invoiceDelayWeeks, 0);
  assert.equal(harness.requests[2].body.timingChangeReason, 'Switch to monthly tuition');
});
