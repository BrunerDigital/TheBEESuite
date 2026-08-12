import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationCenterHrefForRole,
  storedNotificationHref,
  storedNotificationHrefForRole,
} from "@/lib/notification-links";

test("parent photo notifications open the parent portal photos section", () => {
  assert.equal(storedNotificationHref({
    type: "photos",
    body: "Bailey has a new classroom photo in the parent portal.",
  }), "/parent-portal?view=updates");
});

test("all parent notifications stay inside valid parent portal destinations", () => {
  assert.equal(storedNotificationHrefForRole({ type: "message_received", body: "New message" }, "PARENT_GUARDIAN"), "/parent-portal?view=messages");
  assert.equal(storedNotificationHrefForRole({ type: "document_due", body: "Document due" }, "PARENT_GUARDIAN"), "/parent-portal?view=family&section=documents");
  assert.equal(storedNotificationHrefForRole({ type: "account_alert", body: "Account alert" }, "AUTHORIZED_PICKUP"), "/parent-portal?view=home");
  assert.equal(storedNotificationHrefForRole({ type: "message_received", body: "New message" }, "AUTHORIZED_PICKUP"), "/parent-portal?view=home");
  assert.equal(storedNotificationHrefForRole({ type: "account_alert", body: "Account alert" }, "CENTER_DIRECTOR"), "/notifications");
});

test("parent-facing users do not link to the blocked notification center", () => {
  assert.equal(notificationCenterHrefForRole("PARENT_GUARDIAN"), "/parent-portal?view=home");
  assert.equal(notificationCenterHrefForRole("AUTHORIZED_PICKUP"), "/parent-portal?view=home");
  assert.equal(notificationCenterHrefForRole("CENTER_DIRECTOR"), "/notifications");
});

test("payment method form notifications keep secure form fallback links", () => {
  assert.equal(storedNotificationHref({
    type: "payment_method_form",
    body: "Finish setup at https://checkout.example/session",
  }), "https://checkout.example/session");

  assert.equal(storedNotificationHref({
    type: "payment_method_form",
    body: "Finish setup in the parent portal.",
  }), "/parent-portal?view=payments");
});
