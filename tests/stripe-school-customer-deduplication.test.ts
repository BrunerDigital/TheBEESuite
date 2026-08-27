import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reconciliation = readFileSync("scripts/reconcile-stripe-school-customers.ts", "utf8");

test("school customer reconciliation is preview-first and exact-target guarded", () => {
  assert.match(reconciliation, /mode: apply \? "apply" : "read_only_preview"/);
  assert.doesNotMatch(reconciliation, /import \{ prisma \} from/);
  assert.match(reconciliation, /AUTHORITATIVE_ENV_KEYS\.forEach\(\(key\) => delete process\.env\[key\]\)/);
  assert.match(reconciliation, /loadEnvConfig\(envDir, false, console, true\)/);
  assert.match(reconciliation, /selected environment must provide DATABASE_URL/);
  assert.match(reconciliation, /loadEnvConfig[\s\S]+await import\("\.\.\/src\/lib\/prisma"\)/);
  assert.match(reconciliation, /--confirm-fingerprint/);
  assert.match(reconciliation, /--expected-target-count/);
  assert.match(reconciliation, /--acknowledge-delete-unreferenced-empty-school-customers/);
  assert.match(reconciliation, /references\.has\(customerId\) \|\| \(customerAccountId && references\.has\(customerAccountId\)\)/);
  assert.match(reconciliation, /value\.startsWith\("cus_"\) \|\| value\.startsWith\("acct_"\)/);
  assert.match(reconciliation, /databaseReferencedByCustomerAccountId/);
  assert.match(reconciliation, /const metadataCenterId = clean\(metadata\.centerId\) \|\| clean\(metadata\.bee_suite_center_id\)/);
  assert.match(reconciliation, /const metadataCenter = centersById\.get\(metadataCenterId\)/);
  assert.match(reconciliation, /matches\.length !== 1/);
  assert.ok(reconciliation.indexOf("const metadataCenter = centersById.get") < reconciliation.indexOf("matches.length !== 1"));
  assert.match(reconciliation, /schoolCustomerEvidence/);
  assert.match(reconciliation, /clean\(metadata\.tenantId\) === center\.organization\.tenantId/);
  assert.match(reconciliation, /clean\(metadata\.centerId\) === center\.id/);
  assert.match(reconciliation, /clean\(metadata\.paymentScope\) === "school_software_fee"/);
  assert.match(reconciliation, /clean\(metadata\.bee_suite_center_id\) === center\.id/);
  assert.match(reconciliation, /LEGACY_CONNECT_PURPOSES\.has/);
  assert.match(reconciliation, /LEGACY_CUSTOMER_CREATED_BEFORE/);
  assert.match(reconciliation, /LEGACY_UNLABELED_BATCH_START/);
  assert.match(reconciliation, /LEGACY_UNLABELED_BATCH_END/);
  assert.match(reconciliation, /Object\.keys\(metadata\)\.length === 0/);
  assert.match(reconciliation, /customerEmail\.length > 0 && centerEmail\.length > 0 && customerEmail === centerEmail/);
  assert.match(reconciliation, /customerEmail\.endsWith\("@kidcityusa\.com"\)/);
});

test("school customer deletion holds every billing and payment evidence class", () => {
  for (const evidence of [
    "subscriptions",
    "invoices",
    "pendingInvoiceItems",
    "paymentIntents",
    "setupIntents",
    "charges",
    "checkoutSessions",
    "quotes",
    "paymentMethods",
    "taxIds",
    "balanceTransactions",
    "cashBalanceTransactions",
    "accountsV2CustomerConfiguration",
    "customerBalance",
    "cashBalance",
    "defaultSource",
    "defaultPaymentMethod",
    "sources",
  ]) assert.match(reconciliation, new RegExp(evidence));
  assert.match(reconciliation, /customerAccountId: clean\(customer\.customer_account\) \|\| null/);
  assert.match(reconciliation, /held_new_database_reference/);
  assert.match(reconciliation, /liveReferences\.has\(target\.customerId\) \|\| \(liveCustomerAccountId && liveReferences\.has\(liveCustomerAccountId\)\)/);
  assert.match(reconciliation, /concurrent_setup_adoption_candidate/);
  assert.match(reconciliation, /evidence === "school_software_metadata"/);
  assert.match(reconciliation, /held_metadata_drift/);
  assert.match(reconciliation, /held_new_activity/);
  assert.match(reconciliation, /deleted\.deleted !== true/);
  const applyLoop = reconciliation.indexOf("for (const target of targets)");
  const perTargetReferenceReload = reconciliation.indexOf("const liveReferences = (await loadDatabaseReferences()).references", applyLoop);
  const deleteRequest = reconciliation.indexOf('"DELETE"', applyLoop);
  assert.ok(applyLoop >= 0 && perTargetReferenceReload > applyLoop && deleteRequest > perTargetReferenceReload);
});

test("school software customer creation reuses provider metadata and is idempotent", () => {
  const integrations = readFileSync("src/lib/integrations.ts", "utf8");
  const setupRoute = readFileSync("src/app/api/billing/software-payment-method/route.ts", "utf8");
  const developerRoute = readFileSync("src/app/api/developer/software-subscriptions/route.ts", "utf8");
  assert.match(integrations, /findStripeSchoolSoftwareCustomers/);
  assert.match(integrations, /metadata\['tenantId'\]/);
  assert.match(integrations, /metadata\['centerId'\]/);
  assert.match(integrations, /metadata\['paymentScope'\]/);
  assert.match(integrations, /"Idempotency-Key": clean\(idempotencyKey\)/);
  for (const route of [setupRoute, developerRoute]) {
    assert.match(route, /findStripeSchoolSoftwareCustomers/);
    assert.match(route, /existing\.customerIds\.length > 1/);
    assert.match(route, /school-software-customer:\$\{user\.tenantId\}:\$\{center\.id\}/);
    assert.match(route, /email: center\.email \|\| null/);
    assert.match(route, /name: center\.crmLocationId \|\| center\.name/);
  }
  assert.match(developerRoute, /const latestCenter = await prisma\.center\.findUnique/);
  assert.match(developerRoute, /latestCustomerId && latestCustomerId !== customerId/);
  assert.match(developerRoute, /prisma\.\$executeRaw\(Prisma\.sql/);
  assert.match(developerRoute, /jsonb_set/);
  assert.match(developerRoute, /->> 'stripeSoftwareCustomerId'/);
  assert.doesNotMatch(developerRoute, /customFields: \{ \.\.\.fields, stripeSoftwareCustomerId: customerId \}/);
});
