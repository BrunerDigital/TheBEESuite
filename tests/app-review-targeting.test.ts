import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_REVIEW_PARENT_CONTACT,
  APP_REVIEW_TEACHER_CONTACT,
  type AppReviewCenterScope,
  type AppReviewClassroomRoster,
  type AppReviewFamilyScope,
  appReviewClassroomScopeDigest,
  appReviewClassroomScopeViolation,
  appReviewCenterScopeViolation,
  appReviewFamilyScopeDigest,
  appReviewFamilyScopeViolation,
  appReviewIdentityKind,
  appReviewReservedIdentityKind,
  appReviewTeacherStaffMarkerIsValid,
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";

function demoCenterScope(): AppReviewCenterScope {
  return {
    id: "center-demo",
    organizationId: "org-demo",
    ownerGroupId: "owner-demo",
    name: "Little Harbor Demo School",
    crmLocationId: "demo-little-harbor",
    locationId: "demo-little-harbor",
    address: "100 Demo Lane",
    city: "Harbor City",
    state: "FL",
    postalCode: "33000",
    phone: "(555) 010-0100",
    email: "school.demo@example.com",
    status: "active",
    sourceSystem: "bee_suite_demo",
    externalId: "demo-center-little-harbor",
    customFields: { demoWorkspace: true },
    licensedCapacity: 100,
    timezone: "America/New_York",
    organization: {
      id: "org-demo",
      tenantId: "tenant-demo",
      name: "Demo Organization",
      tenant: { id: "tenant-demo", name: "BEE Suite Isolated Demo", slug: "bee-suite-isolated-demo" },
      brand: { id: "brand-demo", name: "BEE Suite Demo", slug: "bee-suite-demo" },
    },
    ownerGroup: {
      id: "owner-demo",
      tenantId: "tenant-demo",
      organizationId: "org-demo",
      name: "Demo Owner Group",
      slug: "demo-owner-group",
      ownerType: "demo",
      status: "active",
      customFields: { demoWorkspace: true },
    },
  };
}

function demoFamilyScope(): AppReviewFamilyScope {
  const now = new Date("2026-09-08T12:00:00.000Z");
  const demoClassroom = {
    id: "classroom-demo",
    centerId: "center-demo",
    name: "Demo Classroom",
    ageGroup: "Preschool",
    capacity: 20,
    ratioRule: "1:10",
    sourceSystem: "bee_suite_demo",
    externalId: "demo-classroom-review",
    customFields: { demoWorkspace: true },
  };
  return {
    id: "family-demo",
    centerId: "center-demo",
    name: "Demo Family",
    address: "100 Demo Lane",
    billingEmail: "guardian.demo@example.com",
    notes: "Synthetic fixture",
    custodyNotes: null,
    sourceSystem: "bee_suite_demo",
    externalId: "demo-family-review",
    customFields: { demoWorkspace: true },
    createdAt: now,
    updatedAt: now,
    children: [{
      id: "child-demo",
      familyId: "family-demo",
      classroomId: "classroom-demo",
      fullName: "Demo Child",
      preferredName: "Demo",
      dateOfBirth: new Date("2022-01-01T12:00:00.000Z"),
      ageGroup: "Preschool",
      enrollmentStatus: "enrolled",
      startDate: now,
      schedule: null,
      photoVideoPermission: true,
      fieldTripPermission: true,
      napNotes: null,
      feedingNotes: null,
      pottyNotes: null,
      developmentalNotes: null,
      sourceSystem: "bee_suite_demo",
      externalId: "demo-child-review",
      customFields: { demoWorkspace: true },
      createdAt: now,
      updatedAt: now,
      classroom: demoClassroom,
      liveLocation: null,
      allergies: [],
      medicalNotes: [],
      attendance: [],
      checkLogs: [],
      dailyReports: [],
      incidents: [],
      documents: [],
      media: [],
    }],
    guardians: [
      {
        id: "guardian-demo",
        familyId: "family-demo",
        userId: null,
        fullName: "Demo Guardian",
        email: "guardian.demo@example.com",
        phone: "(555) 010-0101",
        employer: null,
        relation: "Parent",
        preferredCommunication: "Email",
        isBillingContact: true,
        sourceSystem: "bee_suite_demo",
        externalId: "demo-guardian-primary",
        checkInPinHash: null,
        checkInPinSetAt: null,
        checkInPinSetById: null,
        customFields: { demoWorkspace: true },
        user: null,
      },
      {
        id: "guardian-review",
        familyId: "family-demo",
        userId: "user-review",
        fullName: "App Review Parent",
        email: APP_REVIEW_PARENT_CONTACT.email,
        phone: "(555) 010-0424",
        employer: "App Review",
        relation: "Parent / Guardian",
        preferredCommunication: "Email + portal notification",
        isBillingContact: true,
        sourceSystem: APP_REVIEW_PARENT_CONTACT.sourceSystem,
        externalId: APP_REVIEW_PARENT_CONTACT.externalId,
        checkInPinHash: null,
        checkInPinSetAt: null,
        checkInPinSetById: null,
        customFields: { appReview: true, seededBy: APP_REVIEW_PARENT_CONTACT.seededBy },
        user: {
          id: "user-review",
          email: APP_REVIEW_PARENT_CONTACT.email,
          name: "App Review Parent",
          tenantId: "tenant-demo",
          role: "PARENT_GUARDIAN",
          isActive: false,
          customFields: { appReview: true, seededBy: APP_REVIEW_PARENT_CONTACT.seededBy },
          staffProfile: null,
        },
      },
      {
        id: "guardian-synthetic",
        familyId: "family-demo",
        userId: "user-synthetic-parent",
        fullName: "Synthetic Parent",
        email: "parent@synthetic.thebeesuite.io",
        phone: "(555) 010-0102",
        employer: null,
        relation: "Parent",
        preferredCommunication: "Email",
        isBillingContact: false,
        sourceSystem: "bee_suite_ux_acceptance_qa",
        externalId: "synthetic-parent",
        checkInPinHash: null,
        checkInPinSetAt: null,
        checkInPinSetById: null,
        customFields: { syntheticTest: true },
        user: {
          id: "user-synthetic-parent",
          email: "parent@synthetic.thebeesuite.io",
          name: "Synthetic Parent",
          tenantId: "tenant-demo",
          role: "PARENT_GUARDIAN",
          isActive: true,
          customFields: { syntheticTest: true },
          staffProfile: null,
        },
      },
    ],
    pickups: [{
      id: "pickup-demo",
      familyId: "family-demo",
      userId: null,
      fullName: "Demo Pickup",
      phone: "(555) 010-0103",
      relation: "Grandparent",
      verificationNotes: "Synthetic fixture",
      sourceSystem: "bee_suite_demo",
      externalId: "pickup-demo",
      customFields: null,
      user: null,
    }],
    emergencyContacts: [{
      id: "contact-demo",
      familyId: "family-demo",
      fullName: "Demo Emergency Contact",
      phone: "(555) 010-0104",
      relation: "Aunt",
      sourceSystem: "bee_suite_demo",
      externalId: "emergency-demo",
      customFields: { demoWorkspace: true },
    }],
    billingAccount: null,
    messages: [],
    documents: [],
    dataDeletionRequests: [],
  };
}

test("App Review target fingerprints are deterministic and target-sensitive", () => {
  const fields = {
    tenantId: "tenant-demo",
    centerId: "center-demo",
    familyId: "family-demo",
  };
  const first = buildAppReviewTargetFingerprint("parent", fields);
  const reordered = buildAppReviewTargetFingerprint("parent", {
    familyId: fields.familyId,
    tenantId: fields.tenantId,
    centerId: fields.centerId,
  });

  assert.equal(first, reordered);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, buildAppReviewTargetFingerprint("parent", { ...fields, familyId: "other-family" }));
  assert.notEqual(first, buildAppReviewTargetFingerprint("teacher", fields));
});

test("App Review target fingerprints reject missing or stale confirmation", () => {
  assert.throws(
    () => buildAppReviewTargetFingerprint("parent", { tenantId: "" }),
    /empty App Review target field/,
  );
  assert.throws(
    () => assertAppReviewTargetFingerprint({
      expected: "a".repeat(64),
      provided: "b".repeat(64),
      environmentVariable: "APP_REVIEW_TARGET_FINGERPRINT",
    }),
    /exact fingerprint returned by a fresh --preflight/,
  );
  assert.doesNotThrow(() => assertAppReviewTargetFingerprint({
    expected: "a".repeat(64),
    provided: `  ${"A".repeat(64)}  `,
    environmentVariable: "APP_REVIEW_TARGET_FINGERPRINT",
  }));
});

test("App Review identity and center guards require the exact reserved synthetic markers", () => {
  assert.equal(appReviewReservedIdentityKind(APP_REVIEW_PARENT_CONTACT.email.toUpperCase()), "parent");
  assert.equal(appReviewReservedIdentityKind(APP_REVIEW_TEACHER_CONTACT.email), "teacher");
  assert.equal(appReviewIdentityKind({
    email: APP_REVIEW_TEACHER_CONTACT.email,
    role: "TEACHER",
    customFields: { appReview: true, seededBy: APP_REVIEW_TEACHER_CONTACT.seededBy },
  }), "teacher");
  assert.equal(appReviewIdentityKind({
    email: APP_REVIEW_TEACHER_CONTACT.email,
    role: "TEACHER",
    customFields: { appReview: true, seededBy: "unexpected-script" },
  }), null);

  const center = demoCenterScope();
  assert.equal(appReviewCenterScopeViolation({ center, tenantId: "tenant-demo" }), null);
  const crossTenant = structuredClone(center);
  crossTenant.ownerGroup!.tenantId = "other-tenant";
  assert.match(
    appReviewCenterScopeViolation({ center: crossTenant, tenantId: "tenant-demo" }) ?? "",
    /outside the exact review tenant/,
  );
  const liveProviderCenter = structuredClone(center);
  liveProviderCenter.customFields = { demoWorkspace: true, stripeAccountId: "acct_live_example" };
  assert.match(
    appReviewCenterScopeViolation({ center: liveProviderCenter, tenantId: "tenant-demo" }) ?? "",
    /live provider identifier/,
  );
});

test("App Review Teacher runtime marker rejects generic demo or stale kiosk state", () => {
  const marker = {
    sourceSystem: APP_REVIEW_TEACHER_CONTACT.sourceSystem,
    externalId: APP_REVIEW_TEACHER_CONTACT.externalId,
    customFields: { appReview: true, seededBy: APP_REVIEW_TEACHER_CONTACT.seededBy },
  };
  assert.equal(appReviewTeacherStaffMarkerIsValid(marker), true);
  assert.equal(appReviewTeacherStaffMarkerIsValid({
    ...marker,
    sourceSystem: "bee_suite_demo",
    customFields: { demoWorkspace: true },
  }), false);
  assert.equal(appReviewTeacherStaffMarkerIsValid({
    ...marker,
    customFields: { ...marker.customFields, staffKioskPinHash: "stale-review-pin" },
  }), false);
});

test("App Review family scope accepts only the isolated synthetic relationship graph", () => {
  const family = demoFamilyScope();
  assert.equal(appReviewFamilyScopeViolation({
    family,
    centerId: "center-demo",
    tenantId: "tenant-demo",
  }), null);

  const unsafeGuardian = structuredClone(family);
  unsafeGuardian.guardians.push({
    id: "guardian-real",
    familyId: "family-demo",
    userId: null,
    fullName: "Unsafe Guardian",
    email: null,
    phone: null,
    employer: null,
    relation: "Parent",
    preferredCommunication: null,
    isBillingContact: false,
    sourceSystem: "procare",
    externalId: "real-guardian",
    checkInPinHash: null,
    checkInPinSetAt: null,
    checkInPinSetById: null,
    customFields: null,
    user: null,
  });
  assert.match(
    appReviewFamilyScopeViolation({ family: unsafeGuardian, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /guardian without verified synthetic/,
  );

  const unsafePickup = structuredClone(family);
  unsafePickup.pickups[0].sourceSystem = null;
  assert.match(
    appReviewFamilyScopeViolation({ family: unsafePickup, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /authorized pickup without verified synthetic/,
  );

  const unsafeContact = structuredClone(family);
  unsafeContact.emergencyContacts[0].sourceSystem = "procare";
  assert.match(
    appReviewFamilyScopeViolation({ family: unsafeContact, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /emergency contact without verified synthetic/,
  );

  const unsafeReviewPin = structuredClone(family);
  unsafeReviewPin.guardians[1].checkInPinHash = "not-a-real-hash";
  assert.match(
    appReviewFamilyScopeViolation({ family: unsafeReviewPin, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /guardian without verified synthetic/,
  );

  const unsafePayment = structuredClone(family);
  unsafePayment.billingAccount = {
    id: "billing-demo",
    familyId: "family-demo",
    balanceCents: 0,
    autopayPlaceholder: false,
    ledgerSyncedAt: null,
    sourceSystem: "bee_suite_demo",
    externalId: "demo-billing-family-demo",
    customFields: { demoWorkspace: true },
    invoices: [],
    payments: [{
      id: "payment-live",
      billingAccountId: "billing-demo",
      amountCents: 100,
      status: "PAID",
      provider: "stripe",
      externalIdPlaceholder: "pi_live_secret",
      customFields: null,
      paidAt: new Date("2026-09-08T12:00:00.000Z"),
    }],
    ledgerEntries: [],
  };
  assert.match(
    appReviewFamilyScopeViolation({ family: unsafePayment, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /live provider identifier or unapproved external URL|payment that is not isolated mock demo data/,
  );
});

test("App Review family scope accepts isolated reviewer uploads and rejects cross-identity deletion requests", () => {
  const family = demoFamilyScope();
  const now = new Date("2026-09-08T12:00:00.000Z");
  family.children[0].media.push({
    id: "media-review-upload",
    childId: "child-demo",
    classroomId: "classroom-demo",
    uploadedById: null,
    dailyReportId: null,
    url: "supabase://child-media/demo-media/child-demo/app-review/media-review.jpg",
    storageKey: "demo-media/child-demo/app-review/media-review.jpg",
    caption: "Synthetic review upload",
    mediaType: "photo",
    status: "shared",
    sharedWithParents: true,
    takenAt: now,
    createdAt: now,
    uploadedBy: null,
  });
  family.dataDeletionRequests.push({
    id: "deletion-review",
    tenantId: "tenant-demo",
    centerId: "center-demo",
    familyId: "family-demo",
    guardianId: "guardian-review",
    userId: "user-review",
    requestType: "account_deletion",
    status: "verified",
    source: "parent_portal",
    requesterEmail: APP_REVIEW_PARENT_CONTACT.email,
    requesterName: "App Review Parent",
    details: null,
    retentionNoticeAccepted: true,
    schoolReviewRequired: true,
    verifiedAt: now,
    dueAt: now,
    completedAt: null,
    deniedAt: null,
    cancelledAt: null,
    metadata: { demoWorkspace: true, appReview: true },
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(appReviewFamilyScopeViolation({
    family,
    centerId: "center-demo",
    tenantId: "tenant-demo",
  }), null);

  const wrongUser = structuredClone(family);
  wrongUser.dataDeletionRequests[0].userId = "unrelated-user";
  assert.match(
    appReviewFamilyScopeViolation({ family: wrongUser, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /account-deletion request without verified synthetic provenance/,
  );

  const mismatchedMediaUrl = structuredClone(family);
  mismatchedMediaUrl.children[0].media[0].url = "supabase://child-media/demo-media/other-child/app-review/media-review.jpg";
  assert.match(
    appReviewFamilyScopeViolation({ family: mismatchedMediaUrl, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /child media outside the synthetic actor or demo storage boundary/,
  );
});

test("App Review family scope rejects cross-center classroom and live-location links", () => {
  const crossCenterClassroom = demoFamilyScope();
  crossCenterClassroom.children[0].classroom!.centerId = "other-center";
  assert.match(
    appReviewFamilyScopeViolation({ family: crossCenterClassroom, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /cross-center classroom/,
  );

  const crossCenterLocation = demoFamilyScope();
  crossCenterLocation.children[0].liveLocation = {
    id: "location-demo",
    childId: "child-demo",
    centerId: "other-center",
    currentClassroomId: null,
    areaName: null,
    status: "in_classroom",
    reason: null,
    movedAt: new Date("2026-09-08T12:00:00.000Z"),
    movedById: null,
    currentClassroom: null,
    movedBy: null,
  };
  assert.match(
    appReviewFamilyScopeViolation({ family: crossCenterLocation, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /cross-center live location/,
  );
});

test("App Review classroom scope rejects non-demo roster children and family contacts", () => {
  const family = demoFamilyScope();
  const classroom: AppReviewClassroomRoster = {
    id: "classroom-demo",
    centerId: "center-demo",
    name: "Demo Classroom",
    ageGroup: "Preschool",
    capacity: 20,
    ratioRule: "1:10",
    sourceSystem: "bee_suite_demo",
    externalId: "demo-classroom-review",
    customFields: { demoWorkspace: true },
    children: [{
      id: "child-demo",
      familyId: "family-demo",
      classroomId: "classroom-demo",
      enrollmentStatus: "enrolled",
      sourceSystem: "bee_suite_demo",
      externalId: "demo-child-review",
      customFields: { demoWorkspace: true },
      family,
    }],
    staff: [],
  };
  assert.equal(appReviewClassroomScopeViolation({
    classroom,
    centerId: "center-demo",
    tenantId: "tenant-demo",
  }), null);

  const classroomWithReviewTeacher = structuredClone(classroom);
  classroomWithReviewTeacher.staff.push({
    id: "staff-review",
    userId: "teacher-review",
    centerId: "center-demo",
    classroomId: "classroom-demo",
    title: "App Review Teacher",
    phone: "(555) 010-0425",
    sourceSystem: APP_REVIEW_TEACHER_CONTACT.sourceSystem,
    externalId: APP_REVIEW_TEACHER_CONTACT.externalId,
    customFields: { appReview: true, seededBy: APP_REVIEW_TEACHER_CONTACT.seededBy },
    user: {
      id: "teacher-review",
      email: APP_REVIEW_TEACHER_CONTACT.email,
      name: "App Review Teacher",
      tenantId: "tenant-demo",
      role: "TEACHER",
      isActive: false,
      customFields: { appReview: true, seededBy: APP_REVIEW_TEACHER_CONTACT.seededBy },
      staffProfile: {
        id: "staff-review",
        centerId: "center-demo",
        classroomId: "classroom-demo",
        sourceSystem: APP_REVIEW_TEACHER_CONTACT.sourceSystem,
        externalId: APP_REVIEW_TEACHER_CONTACT.externalId,
        customFields: { appReview: true, seededBy: APP_REVIEW_TEACHER_CONTACT.seededBy },
      },
    },
  });
  assert.equal(appReviewClassroomScopeViolation({
    classroom: classroomWithReviewTeacher,
    centerId: "center-demo",
    tenantId: "tenant-demo",
  }), null);

  const malformedReviewTeacher = structuredClone(classroomWithReviewTeacher);
  malformedReviewTeacher.staff[0].user.customFields = { appReview: true, seededBy: "unexpected-script" };
  assert.match(
    appReviewClassroomScopeViolation({ classroom: malformedReviewTeacher, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /staff without verified synthetic provenance/,
  );

  const unsafeChild = structuredClone(classroom);
  unsafeChild.children[0].sourceSystem = "procare";
  assert.match(
    appReviewClassroomScopeViolation({ classroom: unsafeChild, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /roster contains a child/,
  );

  const unsafeFamilyContact = structuredClone(classroom);
  unsafeFamilyContact.children[0].family.guardians[0].sourceSystem = "procare";
  assert.match(
    appReviewClassroomScopeViolation({ classroom: unsafeFamilyContact, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /roster family contains a guardian/,
  );

  const formerRoster = structuredClone(classroom);
  formerRoster.children[0].enrollmentStatus = "withdrawn";
  assert.match(
    appReviewClassroomScopeViolation({ classroom: formerRoster, centerId: "center-demo", tenantId: "tenant-demo" }) ?? "",
    /no currently enrolled/,
  );
});

test("App Review scope digests are deterministic and change with reachable relationships", () => {
  const family = demoFamilyScope();
  const reordered = structuredClone(family);
  reordered.guardians.reverse();
  assert.equal(appReviewFamilyScopeDigest(family), appReviewFamilyScopeDigest(reordered));

  reordered.children[0].classroomId = "different-classroom";
  assert.notEqual(appReviewFamilyScopeDigest(family), appReviewFamilyScopeDigest(reordered));

  const classroom: AppReviewClassroomRoster = {
    id: "classroom-demo",
    centerId: "center-demo",
    name: "Demo Classroom",
    ageGroup: "Preschool",
    capacity: 20,
    ratioRule: "1:10",
    sourceSystem: "bee_suite_demo",
    externalId: "demo-classroom-review",
    customFields: { demoWorkspace: true },
    children: [{
      id: "child-demo",
      familyId: "family-demo",
      classroomId: "classroom-demo",
      enrollmentStatus: "enrolled",
      sourceSystem: "bee_suite_demo",
      externalId: "demo-child-review",
      customFields: { demoWorkspace: true },
      family,
    }],
    staff: [],
  };
  assert.match(appReviewClassroomScopeDigest(classroom), /^[a-f0-9]{64}$/);
});
