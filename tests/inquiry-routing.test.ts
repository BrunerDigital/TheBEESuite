import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPreferredInquiryCenter } from "../src/lib/inquiry-routing";

test("inquiry routing prefers active centers over lead queue placeholders", () => {
  const selected = selectPreferredInquiryCenter(
    [
      {
        id: "lead_queue_macclenny",
        status: "lead_queue",
        crmLocationId: "FL | MacClenny",
        locationId: "FL | MacClenny",
        name: "Kid City USA - FL | MacClenny",
      },
      {
        id: "active_macclenny",
        status: "active",
        crmLocationId: "FL | Macclenny",
        locationId: "Kid City USA - MacClenny",
        name: "Kid City USA - MacClenny",
      },
    ],
    ["FL | Macclenny", "Kid City USA - MacClenny"],
  );

  assert.equal(selected?.id, "active_macclenny");
});

test("inquiry routing ranks CRM location matches before public id and name", () => {
  const selected = selectPreferredInquiryCenter(
    [
      {
        id: "name_match",
        status: "active",
        crmLocationId: "CRM-OTHER",
        locationId: "PUBLIC-OTHER",
        name: "IN | Westfield",
      },
      {
        id: "crm_match",
        status: "active",
        crmLocationId: "IN | Westfield",
        locationId: "Kid City USA - Westfield",
        name: "Kid City USA - Westfield",
      },
    ],
    ["IN | Westfield", "Kid City USA - Westfield"],
  );

  assert.equal(selected?.id, "crm_match");
});

test("inquiry routing sends Vero Beach website selections to the active Vero Beach CRM center", () => {
  const selected = selectPreferredInquiryCenter(
    [
      {
        id: "archived_vero",
        status: "archived",
        crmLocationId: "FL | Vero Beach",
        locationId: "Kid City USA - Vero Beach",
        name: "Kid City USA - Vero Beach",
      },
      {
        id: "active_vero",
        status: "active",
        crmLocationId: "FL | Vero Beach",
        locationId: "Kid City USA - Vero Beach",
        name: "Kid City USA - Vero Beach",
      },
    ],
    ["FL | Vero Beach", "Kid City USA - Vero Beach"],
  );

  assert.equal(selected?.id, "active_vero");
});

test("inquiry routing returns null when no candidate matches selected location ids", () => {
  const selected = selectPreferredInquiryCenter(
    [
      {
        id: "other",
        status: "active",
        crmLocationId: "OTHER",
        locationId: "Kid City USA - Other",
        name: "Kid City USA - Other",
      },
    ],
    ["FL | Macclenny"],
  );

  assert.equal(selected, null);
});

test("inquiry routing accepts a saved legacy location alias", () => {
  const selected = selectPreferredInquiryCenter(
    [{
      id: "sarasota",
      status: "active",
      crmLocationId: "Kid City USA - FL | Sarasota",
      locationId: "Kid City USA - FL | Sarasota",
      name: "Kid City USA - Sarasota",
      customFields: { locationAliases: ["FL | Sarasota"] },
    }],
    ["FL | Sarasota"],
  );

  assert.equal(selected?.id, "sarasota");
});

test("inquiry routing fails closed when a legacy alias matches two active schools", () => {
  const selected = selectPreferredInquiryCenter(
    [
      {
        id: "first",
        status: "active",
        crmLocationId: "Brand - FL | First",
        locationId: "Brand - FL | First",
        name: "First",
        customFields: { locationAliases: ["FL | Shared"] },
      },
      {
        id: "second",
        status: "active",
        crmLocationId: "Brand - FL | Second",
        locationId: "Brand - FL | Second",
        name: "Second",
        customFields: { locationAliases: ["FL | Shared"] },
      },
    ],
    ["FL | Shared"],
  );

  assert.equal(selected, null);
});
