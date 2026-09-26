import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBeeSuiteEmailHtml } from "../src/lib/communications-kit";
import { defaultMessageTemplates, mergeStoredAndDefaultMessageTemplates, renderMessageTemplate } from "../src/lib/message-templates";

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

test("saved school email copy keeps its customization while all other built-in templates remain available", () => {
  const saved = [{
    id: "school-template",
    name: "Parent portal welcome and login",
    subject: "Our school welcome",
    body: "Our approved instructions",
    category: "onboarding",
    channel: "email",
    mergeFields: [],
  }];
  const visible = mergeStoredAndDefaultMessageTemplates(saved);
  assert.equal(visible.find((template) => template.name === saved[0].name && template.channel === "email")?.subject, saved[0].subject);
  assert.equal(visible.filter((template) => template.name === saved[0].name && template.channel === "email").length, 1);
  assert.ok(visible.some((template) => template.id === "default-general"));
  assert.equal(visible.length, defaultMessageTemplates.length);
});

test("school communication emails render the selected brand while the platform default remains intact", () => {
  const input = { title: "School update", body: "Hello families" };
  const kidCity = buildBeeSuiteEmailHtml({ ...input, brandKind: "kid-city-usa" });
  const missHoneys = buildBeeSuiteEmailHtml({ ...input, brandKind: "miss-honeys-learning-center" });
  const platform = buildBeeSuiteEmailHtml(input);

  assert.match(kidCity, /brand\/kid-city-usa\/logo-horizontal\.png/);
  assert.match(kidCity, /Kid City USA/);
  assert.doesNotMatch(kidCity, /brand\/miss-honeys-learning-center/);
  assert.match(missHoneys, /brand\/miss-honeys-learning-center\/logo-transparent\.png/);
  assert.match(missHoneys, /Miss Honey&#039;s Learning Center/);
  assert.doesNotMatch(missHoneys, /brand\/kid-city-usa/);
  assert.match(platform, /brand\/the-bee-suite\/logo-primary-horizontal-white\.png/);
  assert.doesNotMatch(platform, /brand\/kid-city-usa|brand\/miss-honeys-learning-center/);
});
