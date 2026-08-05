import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
} from "../src/lib/parent-portal-invitations";
import { BEE_SUITE_BRANDING } from "../src/lib/brand-assets";

const root = process.cwd();
const outputHtml = join(root, "output", "playwright", "parent-portal-invite-preview.html");
const outputText = join(root, "output", "playwright", "parent-portal-invite-preview.txt");
const logoPath = join(root, "public", "brand", "the-bee-suite", "app-icon-dark.png");
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
    name: BEE_SUITE_BRANDING.name,
    tagline: BEE_SUITE_BRANDING.tagline,
    logoSrc,
    logoAlt: BEE_SUITE_BRANDING.logoAlt,
  },
}), "utf8");
writeFileSync(outputText, `${buildParentPortalInvitationText(invitation)}\n`, "utf8");

console.log(`Rendered ${outputHtml}`);
console.log(`Rendered ${outputText}`);
