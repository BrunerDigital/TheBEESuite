import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeProcareGuardianImports,
  type ProcareGuardianImportRecord,
} from "@/lib/procare-guardian-merge";

function guardian(
  input: Partial<ProcareGuardianImportRecord>,
): ProcareGuardianImportRecord {
  return {
    name: "",
    guardianEmail: "",
    guardianPhone: "",
    externalId: null,
    relation: "Guardian",
    billingContact: false,
    employer: "",
    ...input,
  };
}

test("merges a billing payer with the same relationship person and retains the ProCare ID", () => {
  const result = mergeProcareGuardianImports([
    guardian({
      name: "Jordan Smith",
      guardianEmail: "parent82@example.test",
      guardianPhone: "8285550100",
      billingContact: true,
    }),
    guardian({
      name: "Jordan Smith",
      guardianEmail: "parent82@example.test",
      guardianPhone: "8285550100",
      externalId: "PERSON-8",
      relation: "Mom",
    }),
  ]);

  assert.deepEqual(result, [
    guardian({
      name: "Jordan Smith",
      guardianEmail: "parent82@example.test",
      guardianPhone: "8285550100",
      externalId: "PERSON-8",
      relation: "Mom",
      billingContact: true,
    }),
  ]);
});

test("does not merge distinct relationship people only because they share a family", () => {
  const result = mergeProcareGuardianImports([
    guardian({ name: "Alex Smith", externalId: "PERSON-1", relation: "Dad" }),
    guardian({ name: "Alex Smith", externalId: "PERSON-2", relation: "Uncle" }),
  ]);

  assert.equal(result.length, 2);
});
