import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("calendar and reputation records use readable display labels", () => {
  const calendar = source("src/components/operational-calendar.tsx");
  const reputation = source("src/components/reputation-workspace.tsx");

  assert.match(calendar, /calendarDisplayLabel\(event\.status/);
  assert.match(calendar, /calendarDisplayLabel\(event\.syncStatus \?\? event\.source/);
  assert.doesNotMatch(calendar, /role-scoped view|current school scope/i);
  assert.match(reputation, /reputationDisplayLabel\(review\.status/);
  assert.match(reputation, /reputationDisplayLabel\(survey\.status/);
  assert.doesNotMatch(reputation, /No tenant reviews|No tenant surveys|POST \/api\/reputation/i);
});

test("setup, social, and assistant screens use school-task language", () => {
  const setup = source("src/components/school-setup-command-center.tsx");
  const social = source("src/components/social-engagement-hub.tsx");
  const assistant = source("src/components/ai-command-center.tsx");

  assert.match(setup, />School setup</);
  assert.match(setup, /School setup checklist/);
  assert.doesNotMatch(setup, /School setup command center|per-user progress tracker|related modules/i);

  assert.match(social, /Review social messages, Google reviews, and campaign reporting/);
  assert.match(social, /Connected channels/);
  assert.doesNotMatch(social, /school-scoped command center|official platform APIs|Direct API|Meta OAuth|Provider tokens/i);
  assert.match(social, /\$\{center\.name\} · Location \$\{center\.crmLocationId\}/);

  assert.match(assistant, /Ask Mr\. Bee about school activity/);
  assert.match(assistant, /aiDisplayLabel\(suggestion\.status/);
  assert.match(assistant, /Open inquiry/);
  assert.doesNotMatch(assistant, /run the school with you|School scope|current scope|from CRM|Smith family|Jordan Lee|Recent intelligence|intelligence log/i);
});

test("copy changes preserve request destinations and stored action values", () => {
  const calendar = source("src/components/operational-calendar.tsx");
  const reputation = source("src/components/reputation-workspace.tsx");
  const setup = source("src/components/school-setup-command-center.tsx");
  const social = source("src/components/social-engagement-hub.tsx");
  const assistant = source("src/components/ai-command-center.tsx");

  assert.match(calendar, /fetch\("\/api\/calendar\/events"/);
  assert.match(calendar, /fetch\("\/api\/calendar\/google-sync"/);
  assert.match(reputation, /fetch\("\/api\/reputation\/review-requests"/);
  assert.match(reputation, /fetch\("\/api\/reputation\/surveys"/);
  assert.match(setup, /fetch\("\/api\/school-setup"/);
  assert.match(social, /fetch\("\/api\/marketing\/engagement"/);
  assert.match(assistant, /"\/api\/ai\/command"/);
  assert.match(assistant, /"\/api\/communications\/messages\/suggestions"/);
  assert.match(assistant, /destination: "crm_lead"/);
  assert.match([calendar, reputation, setup, social, assistant].join("\n"), /method: "POST"/);
});
