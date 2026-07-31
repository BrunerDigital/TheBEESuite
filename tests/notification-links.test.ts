import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationCenterHrefForRole,
  storedNotificationHref,
} from "@/lib/notification-links";

test("parent photo notifications open the parent portal photos section", () => {
  assert.equal(storedNotificationHref({
    type: "photos",
    body: "Bailey has a new classroom photo in the parent portal.",
  }), "/parent-portal#photos");
});

test("parent-facing users do not link to the blocked notification center", () => {
  assert.equal(notificationCenterHrefForRole("PARENT_GUARDIAN"), "/parent-portal");
  assert.equal(notificationCenterHrefForRole("AUTHORIZED_PICKUP"), "/parent-portal");
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
  }), "/parent-portal#billing");
});
