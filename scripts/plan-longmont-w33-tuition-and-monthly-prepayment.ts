import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const CENTER_NAME = "Kid City USA - Longmont";
const PERIOD = "2026-W33";

type PositiveMonthly = {
  family: string;
  child: string;
  monthlyCents: number;
  weeklyCents: number;
  zeroSiblings?: string[];
};

const positiveMonthly: PositiveMonthly[] = [
  { family: "Aguilar, Aaliyah Household", child: "Genesis Santillan", monthlyCents: 900, weeklyCents: 225 },
  { family: "Araiza, Araceli Household", child: "Stevie Martinez", monthlyCents: 19_300, weeklyCents: 4_825 },
  { family: "Barajas, Annika Household", child: "Tomas Martinez-Barajas", monthlyCents: 33_600, weeklyCents: 8_400 },
  { family: "Chavez, Heather Household", child: "Esmeralda Lejarazo", monthlyCents: 1_700, weeklyCents: 425, zeroSiblings: ["Jade Chavez"] },
  { family: "Eyrich, Leanne Household", child: "Jaxon Kennedy", monthlyCents: 18_600, weeklyCents: 4_650, zeroSiblings: ["Jayme Kennedy", "John Kennedy Jr."] },
  { family: "Figueras, Keilin Household", child: "Alana Figueras", monthlyCents: 4_000, weeklyCents: 1_000 },
  { family: "Galindo, Samantha Household", child: "Ellie Diaz", monthlyCents: 6_800, weeklyCents: 1_700, zeroSiblings: ["Giovanni Diaz"] },
  { family: "Hernandez, Mayra Household", child: "Sofia Arellano Puentes", monthlyCents: 12_100, weeklyCents: 3_025, zeroSiblings: ["J'Bryan Arellano"] },
  { family: "Kachensky, Christine Household", child: "Dahlia Gotzmer", monthlyCents: 13_600, weeklyCents: 3_400 },
  { family: "Lauzon, Victoria Household", child: "Mary Ann J Gonzales", monthlyCents: 8_000, weeklyCents: 2_000 },
  { family: "Stilwell, Andrea Household", child: "Damian Borovy", monthlyCents: 21_300, weeklyCents: 5_325, zeroSiblings: ["Emani Kalenzi"] },
];

const explicitZeroFamilies: Array<{ family: string; children: string[]; evidence: string }> = [
  { family: "Jackson, Alyssa Household", children: ["Drew Banks"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Lara, Ashley Household", children: ["Izaac Rodriguez"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Marrufo, Candice Household", children: ["Anastasia R Gonzales"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Melhus, Lindsay Household", children: ["Carter Harris", "Madelyn Harris"], evidence: "ProCare monthly family parent co-pay is $0; CCCAP agency charges are separate." },
  { family: "Meskimen, Sabrina Household", children: ["Violet D Rose"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Moore, Candice Household", children: ["Ezekiel Murillo", "Zara Murillo"], evidence: "ProCare monthly family parent co-pay is $0; CCCAP agency charges are separate." },
  { family: "Perez, Jessica Household", children: ["Mia Saldana"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Rangel, Daisha Household", children: ["Dalylah Saucedo", "Julian Saucedo"], evidence: "ProCare monthly family parent co-pay is $0; CCCAP agency charges are separate." },
  { family: "Romero, Stephanie Household", children: ["Eliana Celani", "Reziah Celani"], evidence: "ProCare $191 monthly parent co-pay is fully offset by a 100% employee discount; net family responsibility $0." },
  { family: "Smitih, Grayson Household", children: ["Sylas Smith"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Vandesteene Family", children: ["Vandesteene, Mason"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Velarde Family", children: ["Velarde, Cesar"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
  { family: "Walmsley, Justin Household", children: ["Ellie Branch"], evidence: "ProCare July monthly parent co-pay net $0; CCCAP agency charge is separate." },
];

const heldForEvidence = [
  { family: "Bosco", children: ["Bo Bosco"], reason: "New child is absent from the July 31 ProCare contract report; no amount or $0 funding evidence exists." },
  { family: "Joseph, Emilienne Household", children: ["Emiliana Kalenzi", "Theodore Kalenzi"], reason: "ProCare shows CCCAP charges but no explicit parent co-pay line; confirm $0 before activation." },
  { family: "Long Family", children: ["Long, Cayson", "Martinez, Emily", "VillaRose, D'artagnan"], reason: "ProCare shows CCCAP charges but no explicit parent co-pay line; confirm $0 before activation." },
  { family: "Hernandez, Mariah Household", children: ["Hernandez, Rodrigo", "Holly Hernandez"], reason: "Rodrigo's $40 monthly co-pay is attached to Yadira Soto account 42396, while the live family/director reply places him under Mariah Hernandez account 35000." },
];

const dropIn = [
  { family: "Fetterolf, Caroline Household", child: "Rowan Fetterolf" },
  { family: "Horne", child: "Elara Horne" },
  { family: "Poole, Aaron Household", child: "Kooper Gregory" },
  { family: "Poole, Aaron Household", child: "Martin Poole" },
];

const balanceCorrections = [
  { family: "Airhart, Annabelle Household", invoice: "PC-62n7w2-ORTIZ", kind: "revert_invoice_edit", deltaCents: -47_500 },
  { family: "Eyrich, Leanne Household", invoice: "PC-62n7w2-EYRICH", kind: "revert_invoice_edit", deltaCents: -16_600 },
  { family: "Bernal, Ashley Household", invoice: "INV-20260805-052D03F8", kind: "void_duplicate_opening_balance", deltaCents: -46_500 },
  { family: "Galindo, Samantha Household", invoice: "INV-20260805-72266D2E", kind: "void_duplicate_opening_balance", deltaCents: -6_800 },
  { family: "Kachensky, Christine Household", invoice: "INV-20260805-CF98A9BF", kind: "void_duplicate_opening_balance", deltaCents: -62_000 },
  { family: "Poole, Aaron Household", invoice: "INV-20260805-0D0C60C6", kind: "void_duplicate_opening_balance", deltaCents: -44_000 },
  { family: "Zepp, Danielle Household", invoice: "INV-20260805-B95D8B3C", kind: "void_duplicate_opening_balance", deltaCents: -31_000 },
  { family: "Fetterolf, Caroline Household", invoice: "INV-20260806-4B350713", kind: "void_duplicate_drop_in_week", deltaCents: -31_000 },
];

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const center = await prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, customFields: true } });
  invariant(center?.name === CENTER_NAME && center.status !== "closed", "Longmont center identity or status changed.");
  const centerFields = object(center.customFields);
  invariant(centerFields.livePaymentsEnabled === true && centerFields.tuitionBillingEnabled === true && centerFields.stripeBillingApproved === true, "Longmont payment or tuition approval is no longer active.");

  const children = await prisma.child.findMany({
    where: { ...currentlyEnrolledChildWhere(), family: { is: { centerId: CENTER_ID } } },
    select: {
      id: true,
      fullName: true,
      enrollmentStatus: true,
      classroomId: true,
      customFields: true,
      family: {
        select: {
          id: true,
          name: true,
          billingAccount: {
            select: {
              id: true,
              balanceCents: true,
              customFields: true,
              invoices: { select: { id: true, number: true, status: true, totalCents: true, dueDate: true, customFields: true } },
              payments: { select: { id: true, status: true, amountCents: true, provider: true, externalIdPlaceholder: true, customFields: true } },
              ledgerEntries: { select: { id: true, type: true, amountCents: true, balanceAfterCents: true, externalId: true }, orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
            },
          },
        },
      },
    },
    orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
  });
  invariant(children.length === 79, `Expected 79 current Longmont children; found ${children.length}.`);

  const exactChild = (familyName: string, childName: string) => {
    const matches = children.filter((child) => child.family.name === familyName && child.fullName === childName);
    invariant(matches.length === 1, `Expected one current ${familyName} / ${childName}; found ${matches.length}.`);
    return matches[0];
  };
  const positiveTargets = positiveMonthly.map((target) => ({ ...target, childId: exactChild(target.family, target.child).id, familyId: exactChild(target.family, target.child).family.id }));
  invariant(positiveTargets.every((target) => target.monthlyCents === target.weeklyCents * 4), "A monthly amount does not divide into exactly four weekly charges.");
  const zeroTargets = [
    ...positiveMonthly.flatMap((target) => (target.zeroSiblings ?? []).map((child) => ({ family: target.family, child, evidence: `Family four-week parent fee is allocated once to ${target.child}; no additional sibling charge.` }))),
    ...explicitZeroFamilies.flatMap((target) => target.children.map((child) => ({ family: target.family, child, evidence: target.evidence }))),
  ].map((target) => ({ ...target, childId: exactChild(target.family, target.child).id, familyId: exactChild(target.family, target.child).family.id }));
  const heldTargets = heldForEvidence.flatMap((target) => target.children.map((child) => ({ ...target, child, childId: exactChild(target.family, child).id })));
  const dropInTargets = dropIn.map((target) => ({ ...target, childId: exactChild(target.family, target.child).id }));

  const assignedPositive = children.filter((child) => {
    const fields = object(child.customFields);
    return fields.tuitionBillingEnabled === true && Number(fields.tuitionPlanAmountCents) > 0;
  });
  const assignedZero = children.filter((child) => {
    const fields = object(child.customFields);
    return fields.tuitionBillingEnabled === true && Number(fields.tuitionPlanAmountCents) === 0;
  });
  invariant(assignedPositive.length === 26, `Expected 26 already assigned positive children; found ${assignedPositive.length}.`);
  invariant(assignedZero.length === 7, `Expected 7 already assigned $0 children; found ${assignedZero.length}.`);

  const classifiedIds = new Set([
    ...assignedPositive.map((child) => child.id),
    ...assignedZero.map((child) => child.id),
    ...positiveTargets.map((target) => target.childId),
    ...zeroTargets.map((target) => target.childId),
    ...heldTargets.map((target) => target.childId),
    ...dropInTargets.map((target) => target.childId),
  ]);
  const duplicates = children.filter((child) => [
    ...assignedPositive.map((item) => item.id),
    ...assignedZero.map((item) => item.id),
    ...positiveTargets.map((item) => item.childId),
    ...zeroTargets.map((item) => item.childId),
    ...heldTargets.map((item) => item.childId),
    ...dropInTargets.map((item) => item.childId),
  ].filter((id) => id === child.id).length > 1);
  invariant(classifiedIds.size === children.length, `Only ${classifiedIds.size} of ${children.length} children were classified.`);
  invariant(duplicates.length === 0, `Children were classified more than once: ${duplicates.map((child) => child.fullName).join(", ")}.`);

  const familyByName = new Map(children.map((child) => [child.family.name, child.family]));
  const correctionState = balanceCorrections.map((correction) => {
    const family = familyByName.get(correction.family);
    invariant(family?.billingAccount, `${correction.family} billing account is missing.`);
    const invoice = family.billingAccount.invoices.find((item) => item.number === correction.invoice);
    invariant(invoice && invoice.status !== PaymentStatus.VOID, `${correction.invoice} is missing or already void.`);
    return { ...correction, familyId: family.id, billingAccountId: family.billingAccount.id, balanceCents: family.billingAccount.balanceCents, invoice };
  });

  const w31MetadataCorrections = assignedPositive.flatMap((child) => {
    const account = child.family.billingAccount;
    invariant(account, `${child.family.name} billing account is missing.`);
    const matches = account.invoices.filter((invoice) => {
      const fields = object(invoice.customFields);
      return invoice.status !== PaymentStatus.VOID
        && fields.childId === child.id
        && fields.chargeSource === "tuitionPlan"
        && fields.billingPeriod === "2026-W31"
        && invoice.totalCents === Number(object(child.customFields).tuitionPlanAmountCents)
        && invoice.dueDate.toISOString().slice(0, 10) === "2026-08-06";
    });
    return matches.map((invoice) => ({ family: child.family.name, familyId: child.family.id, child: child.fullName, childId: child.id, invoice }));
  });
  invariant(w31MetadataCorrections.length === 25, `Expected 25 W31-to-W33 metadata corrections; found ${w31MetadataCorrections.length}.`);

  const monthlyFamilies = positiveTargets.map((target) => {
    const account = familyByName.get(target.family)?.billingAccount;
    invariant(account, `${target.family} billing account is missing.`);
    const correctionCents = correctionState.filter((item) => item.familyId === target.familyId).reduce((sum, item) => sum + item.deltaCents, 0);
    const currentCreditCents = Math.max(0, -account.balanceCents);
    const projectedBalanceCents = account.balanceCents + correctionCents + target.weeklyCents;
    const projectedCreditCents = Math.max(0, -projectedBalanceCents);
    return {
      ...target,
      billingAccountId: account.id,
      currentBalanceCents: account.balanceCents,
      currentCreditCents,
      currentCreditWeeks: currentCreditCents / target.weeklyCents,
      balanceCorrectionCents: correctionCents,
      w33ChargeCents: target.weeklyCents,
      projectedBalanceCents,
      projectedCreditCents,
      projectedCreditWeeks: projectedCreditCents / target.weeklyCents,
      fourWeekPaymentCents: target.weeklyCents * 4,
    };
  });

  const activeDrafts = [...new Map(children.flatMap((child) => child.family.billingAccount?.payments ?? []).filter((payment) => payment.status === PaymentStatus.DRAFT).map((payment) => [payment.id, payment])).values()];
  const correctedAccountIds = new Set(correctionState.map((item) => item.billingAccountId));
  const impactedActiveDrafts = activeDrafts.filter((payment) => {
    const fields = object(payment.customFields);
    return correctedAccountIds.has(String(fields.billingAccountId ?? ""));
  });
  const state = {
    center: { id: center.id, name: center.name, status: center.status },
    period: PERIOD,
    childCount: children.length,
    familyBalances: [...familyByName.values()].map((family) => ({ familyId: family.id, familyName: family.name, accountId: family.billingAccount?.id ?? null, balanceCents: family.billingAccount?.balanceCents ?? null })),
    positiveTargets,
    zeroTargets,
    heldTargets,
    dropInTargets,
    balanceCorrections: correctionState,
    w31MetadataCorrections,
    activeDrafts,
  };
  console.log(JSON.stringify({
    mode: "dry-run-only",
    fingerprint: fingerprint(state),
    asOf: new Date().toISOString(),
    currentWeek: "2026-W32",
    nextWeek: PERIOD,
    currentChildren: children.length,
    alreadyAssigned: { positive: assignedPositive.length, zero: assignedZero.length },
    actionsAfterProductReleaseAndConfirmation: {
      weeklyMonthlyFeeAssignments: positiveTargets.length,
      zeroResponsibilityAssignments: zeroTargets.length,
      w33InvoicesToCreate: positiveTargets.length,
      invoiceMetadataCorrectionsWithoutBalanceChange: w31MetadataCorrections.length,
      balanceCorrections: correctionState.map((item) => ({ family: item.family, invoice: item.invoice.number, kind: item.kind, deltaCents: item.deltaCents })),
      activeDraftsObserved: activeDrafts.length,
      activeDraftsRequiringReconciliation: impactedActiveDrafts.map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents,
        billingAccountId: String(object(payment.customFields).billingAccountId ?? ""),
      })),
    },
    monthlyFamilies,
    explicitZeroFamilies,
    heldForEvidence,
    dropIn,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
