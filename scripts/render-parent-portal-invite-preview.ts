import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
} from "../src/lib/parent-portal-invitations";

const root = process.cwd();
const outputHtml = join(root, "output", "playwright", "parent-portal-invite-preview.html");
const outputText = join(root, "output", "playwright", "parent-portal-invite-preview.txt");
const logoPath = join(root, "public", "brand", "kid-city-usa", "logo-horizontal.png");
const logoSrc = `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;
const invitation = {
  guardianName: "Taylor Parent",
  centerLabel: "Kid City USA - Sample Location",
  email: "taylor.parent@example.com",
  loginUrl: "https://thebeesuite.io/parents/setup",
  transitioningFromProcare: true,
  billingCutoverApproved: false,
};

mkdirSync(dirname(outputHtml), { recursive: true });
writeFileSync(outputHtml, buildParentPortalInvitationHtml({
  ...invitation,
  branding: {
    name: "Kid City USA",
    tagline: "Where Kids Can BEE Kids",
    logoSrc,
    logoAlt: "Kid City USA logo",
  },
}), "utf8");
writeFileSync(outputText, `${buildParentPortalInvitationText(invitation)}\n`, "utf8");

console.log(`Rendered ${outputHtml}`);
console.log(`Rendered ${outputText}`);
