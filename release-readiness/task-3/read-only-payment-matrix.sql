with schools as (
 select c.* from "Center" c join "Organization" o on o.id=c."organizationId" join "Tenant" t on t.id=o."tenantId"
 where c.status='active' and t.name not ilike '%demo%'
), current_children as (
 select ch.*, f."centerId" from "Child" ch join "Family" f on f.id=ch."familyId"
 where lower(trim(ch."enrollmentStatus")) in ('active','enrolled','current') and ch."classroomId" is not null
), accounts as (
 select b.*, f."centerId",exists(select 1 from current_children ch where ch."familyId"=f.id) as is_current
 from "BillingAccount" b join "Family" f on f.id=b."familyId"
), account_metrics as (
 select a."centerId", count(*) as billing_accounts, count(*) filter(where is_current) as current_accounts,
 count(*) filter(where a."customFields"->>'autopayEnabled'='true') as autopay_enabled,
 count(*) filter(where a."customFields"->>'kokomoSchoolwideAutopayPaused'='true') as kokomo_autopay_hold,
 count(*) filter(where a."customFields"->>'autopayEnabled'='true' and
 (not exists(select 1 from "Guardian" g where g."familyId"=a."familyId" and g."userId"=a."customFields"->>'autopayEnabledByUserId')
 or (nullif(a."customFields"->>'autopayPaymentMethodId','') is not null and
 a."customFields"->>'autopayPaymentMethodId' is distinct from a."customFields"->>'stripeDefaultPaymentMethodId'))) as ineligible_autopay_binding,
 count(*) filter(where nullif(a."customFields"->>'stripeDefaultPaymentMethodId','') is not null and
 (a."customFields"->>'stripeDefaultPaymentMethodConnectedAccountId') is distinct from coalesce(c."customFields"->>'stripeConnectAccountId',c."customFields"->>'stripeConnectedAccountId')) as saved_method_on_other_account,
 count(*) filter(where is_current and a."balanceCents">0) as positive_current_balances,
 count(*) filter(where is_current and a."balanceCents">0 and not exists(select 1 from "Invoice" i where i."billingAccountId"=a.id and i.status='OPEN')) as positive_current_balance_without_open_invoice,
 count(*) filter(where is_current and (select l."balanceAfterCents" from "LedgerEntry" l where l."billingAccountId"=a.id and l."balanceAfterCents" is not null order by l."effectiveAt" desc,l."createdAt" desc,l.id desc limit 1) is not null and (select l."balanceAfterCents" from "LedgerEntry" l where l."billingAccountId"=a.id and l."balanceAfterCents" is not null order by l."effectiveAt" desc,l."createdAt" desc,l.id desc limit 1) <> a."balanceCents") as current_ordered_ledger_balance_mismatch,
 count(*) filter(where is_current and (select l."balanceAfterCents" from "LedgerEntry" l where l."billingAccountId"=a.id and l."balanceAfterCents" is not null order by l."createdAt" desc,l.id desc limit 1) is not null and (select l."balanceAfterCents" from "LedgerEntry" l where l."billingAccountId"=a.id and l."balanceAfterCents" is not null order by l."createdAt" desc,l.id desc limit 1) <> a."balanceCents") as current_created_ledger_balance_mismatch,
 coalesce(sum((select coalesce(sum(l."amountCents"),0) from "LedgerEntry" l where l."billingAccountId"=a.id and (l.type in ('agency_payment','agency_receivable','agency_voucher_credit','subsidy_payment','subsidy_receivable') or l."sourceSystem"='subsidy_agency'))),0) as agency_ledger_total_cents
 from accounts a join schools c on c.id=a."centerId" group by a."centerId"
), payments as (
 select a."centerId", p.status,p.provider,coalesce(p."customFields"->>'status','unset') as app_status,
 coalesce(p."customFields"->>'stripePaymentIntentStatus','unset') as intent_status,
 count(*) as n,
 count(*) filter(where p.status='PAID' and not exists(select 1 from "LedgerEntry" l where l."paymentId"=p.id and l."amountCents"<0)) as paid_without_negative_ledger,
 count(*) filter(where p.status in ('FAILED','DRAFT') and exists(select 1 from "LedgerEntry" l where l."paymentId"=p.id and l."amountCents"<0)) as failed_or_draft_with_negative_ledger
 from "Payment" p join accounts a on a.id=p."billingAccountId" group by a."centerId",p.status,p.provider,p."customFields"->>'status',p."customFields"->>'stripePaymentIntentStatus'
), cadence as (
 select ch."centerId", coalesce(ch."customFields"->>'tuitionBillingCadence','unset') as cadence,
 coalesce(ch."customFields"->>'tuitionFundingType','unset') as funding,
 count(*) as n, count(*) filter(where ch."customFields"->>'tuitionBillingEnabled'='true') as enabled,
 min((ch."customFields"->>'tuitionPlanAmountCents')::numeric) as minimum_rate_cents,
 max((ch."customFields"->>'tuitionPlanAmountCents')::numeric) as maximum_rate_cents
 from current_children ch group by ch."centerId",ch."customFields"->>'tuitionBillingCadence',ch."customFields"->>'tuitionFundingType'
)
select now() as observed_at,c.id,c.name,
 c."customFields"->>'livePaymentsEnabled' as live_payments,
 c."customFields"->>'tuitionBillingEnabled' as tuition_enabled,
 c."customFields"->>'stripeConnectMigrationStatus' as connect_migration_status,
 c."customFields"->>'stripePayoutBankDefaultConfirmed' as bank_default_confirmed,
 nullif(c."customFields"->>'stripePayoutBankLast4','') is not null as bank_reference_present,
 (select count(*) from current_children ch where ch."centerId"=c.id) as current_children,
 (select count(distinct ch."familyId") from current_children ch where ch."centerId"=c.id) as current_families,
 (select count(*) from current_children ch where ch."centerId"=c.id and nullif(ch."customFields"->>'tuitionPlanId','') is null) as current_children_without_assignment,
 (select count(*) from current_children ch where ch."centerId"=c.id and ch."customFields"->>'tuitionBillingEnabled'='true' and ch."customFields"->>'tuitionPlanAmountCents' is null) as enabled_without_amount,
 (select coalesce(jsonb_agg(to_jsonb(ca)-'centerId'),'[]') from cadence ca where ca."centerId"=c.id) as cadence,
 (select to_jsonb(am)-'centerId' from account_metrics am where am."centerId"=c.id) as accounts,
 (select coalesce(jsonb_agg(to_jsonb(p)-'centerId'),'[]') from payments p where p."centerId"=c.id) as payments,
 (select coalesce(jsonb_agg(x),'[]') from (select i.status,count(*) as n,sum(i."totalCents") as total_cents from "Invoice" i join accounts a on a.id=i."billingAccountId" where a."centerId"=c.id group by i.status) x) as invoices,
 (select coalesce(jsonb_agg(x),'[]') from (select tp.cadence,count(*) as n,min(tp."amountCents") as minimum_cents,max(tp."amountCents") as maximum_cents from "TuitionPlan" tp where tp."centerId"=c.id group by tp.cadence) x) as plans
 from schools c order by c.name
