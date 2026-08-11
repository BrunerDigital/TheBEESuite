import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  confirmRelationshipRecordSwitch,
  FamilyRelationshipMap,
} from "../src/components/family-relationship-map";
import type { EditableFamilyRecord } from "../src/components/family-record-editor";

const mapSource = readFileSync(new URL("../src/components/family-relationship-map.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

function familyRecord(overrides: Partial<EditableFamilyRecord> = {}): EditableFamilyRecord {
  return {
    id: "family-preview",
    centerId: "center-preview",
    centerName: "Sunshine Academy",
    name: "Rivera Family",
    billingEmail: " parent@example.com ",
    custodyNotes: "",
    guardians: [{
      id: "guardian-preview",
      fullName: "Jordan Rivera",
      email: "PARENT@EXAMPLE.COM",
      phone: "5551234567",
      relation: "Parent",
      isBillingContact: true,
      userId: "user-preview",
    }],
    children: [{
      id: "child-preview",
      fullName: "Ava Rivera",
      ageGroup: "Pre-K",
      enrollmentStatus: "withdrawn",
      classroomId: null,
      allergies: [],
      medicalNotes: [],
      documents: [],
    }],
    pickups: [],
    emergencyContacts: [],
    documents: [],
    billingAccount: null,
    ...overrides,
  };
}

function renderMap(
  family: EditableFamilyRecord,
  duplicateCounts = { families: 0, guardians: 0, children: 0 },
) {
  return renderToString(React.createElement(FamilyRelationshipMap, {
    family,
    duplicateCounts,
    onSelectGuardian: () => true,
    onSelectChild: () => true,
    onSelectPickup: () => true,
    onSelectEmergencyContact: () => true,
  }));
}

test("family relationship map is a read-only child of the existing controlled editor", () => {
  assert.doesNotMatch(mapSource, /["']use client["']/);
  assert.doesNotMatch(mapSource, /fetch\(|\/api\/|useRouter|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(mapSource, /save or discard draft edits before switching/);
  assert.match(editorSource, /import \{ confirmRelationshipRecordSwitch, FamilyRelationshipMap \}/);
  assert.match(editorSource, /\["Relationships", "family-relationships"\]/);
  assert.match(editorSource, /onSelectGuardian=\{selectGuardianFromRelationshipMap\}/);
  assert.match(editorSource, /onSelectChild=\{selectChildFromRelationshipMap\}/);
  assert.match(editorSource, /onSelectPickup=\{selectPickupFromRelationshipMap\}/);
  assert.match(editorSource, /onSelectEmergencyContact=\{selectEmergencyContactFromRelationshipMap\}/);
  assert.match(mapSource, /if \(!select\(\)\) return/);
  assert.match(mapSource, /prefers-reduced-motion: reduce/);
  assert.match(mapSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(mapSource, /document\.getElementById\(focusId\)/);
  assert.match(mapSource, /\(focusTarget \?\? target\)\?\.scrollIntoView/);
  assert.doesNotMatch(mapSource, /No displayed review signals[\s\S]{0,500}CheckCircle2/);
  assert.match(editorSource, /id="family-guardian-selector"/);
  assert.match(editorSource, /id="family-child-selector"/);
  assert.match(editorSource, /id="family-pickup-selector"/);
  assert.match(editorSource, /id="family-emergency-contact-selector"/);
});

test("relationship-map selection never silently replaces a controlled draft", () => {
  let selectedId = "";
  let confirmations = 0;
  const cancelSwitch = confirmRelationshipRecordSwitch({
    currentId: "guardian-current",
    targetId: "guardian-next",
    targetLabel: "parent or guardian",
    draftLabel: "parent or guardian",
    confirmDiscard: () => {
      confirmations += 1;
      return false;
    },
    onSelect: (targetId) => {
      selectedId = targetId;
    },
  });

  assert.equal(cancelSwitch, false);
  assert.equal(confirmations, 1);
  assert.equal(selectedId, "");

  const keepCurrent = confirmRelationshipRecordSwitch({
    currentId: "guardian-current",
    targetId: "guardian-current",
    targetLabel: "parent or guardian",
    draftLabel: "parent or guardian",
    confirmDiscard: () => {
      throw new Error("The selected record must not be rehydrated or confirmed again.");
    },
    onSelect: () => {
      throw new Error("The selected record must keep its controlled draft values.");
    },
  });

  assert.equal(keepCurrent, true);

  const confirmSwitch = confirmRelationshipRecordSwitch({
    currentId: "guardian-current",
    targetId: "guardian-next",
    targetLabel: "parent or guardian",
    draftLabel: "parent or guardian",
    confirmDiscard: (message) => {
      assert.match(message, /unsaved parent or guardian edits will be discarded/);
      return true;
    },
    onSelect: (targetId) => {
      selectedId = targetId;
    },
  });

  assert.equal(confirmSwitch, true);
  assert.equal(selectedId, "guardian-next");
});

test("relationship map applies current-enrollment classroom rules without flagging closed children", () => {
  const currentFamily = familyRecord({
    children: [{
      id: "child-current",
      fullName: "Ava Rivera",
      ageGroup: "Pre-K",
      enrollmentStatus: "active",
      classroomId: null,
      allergies: [],
      medicalNotes: [],
      documents: [],
    }],
  });
  const currentHtml = renderMap(currentFamily);
  assert.match(currentHtml, /Classroom required/);
  assert.match(currentHtml, /1 current child needs a classroom assignment/);

  const closedHtml = renderMap(familyRecord());
  assert.match(closedHtml, /No classroom assigned/);
  assert.doesNotMatch(closedHtml, /Classroom required/);
  assert.match(closedHtml, /No displayed review signals/);
  assert.match(closedHtml, /Duplicate review is not aggregated across every visible household member/);
});

test("relationship map keeps custody guidance private and avoids portal-auth overclaims", () => {
  const privateCustodyText = "Private court-order detail must never render in the map.";
  const html = renderMap(familyRecord({ custodyNotes: privateCustodyText }));

  assert.match(html, /Custody \/ pickup review/);
  assert.doesNotMatch(html, new RegExp(privateCustodyText));
  assert.match(html, /linked Parent Portal account record/);
  assert.match(html, /does not by itself confirm that sign-in is working/);
  assert.doesNotMatch(html, /Relationships clear|No Relationship Conflicts Detected|Portal access is ready/);
});

test("relationship review signals normalize emails and scope duplicate wording to selected records", () => {
  const html = renderMap(
    familyRecord(),
    { families: 0, guardians: 1, children: 0 },
  );

  assert.doesNotMatch(html, /billing email does not match/);
  assert.match(html, /1 possible duplicate candidate relates to the selected family, guardian, or child records/);
  assert.match(html, /Confirm school scope and supporting evidence before merging/);
});
