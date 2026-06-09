import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMessageTemplate } from "../src/lib/message-templates";

test("message templates render expanded family and classroom merge fields", () => {
  const rendered = renderMessageTemplate(
    "{{guardian.firstName}} {{guardian.email}} {{child.firstNames}} {{classroom.names}} {{sender.role}}",
    {
      guardianFirstName: "Avery",
      guardianEmail: "avery@example.com",
      childNames: ["Mia Carter", "Noah Carter"],
      classroomNames: ["Toddlers", "Preschool"],
      senderRole: "center director",
    },
  );

  assert.equal(rendered, "Avery avery@example.com Mia, Noah Toddlers, Preschool center director");
});

test("message templates leave unknown merge fields intact", () => {
  assert.equal(
    renderMessageTemplate("Hello {{custom.field}}", { familyName: "Carter Family" }),
    "Hello {{custom.field}}",
  );
});
