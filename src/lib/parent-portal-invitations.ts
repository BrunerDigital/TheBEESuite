export const PARENT_PORTAL_PATH = "/parent-portal";
export const PARENT_PORTAL_INVITE_MODE = "email_password_setup";

export function buildParentPortalUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}${PARENT_PORTAL_PATH}`;
}

export function buildParentPortalInvitationText({
  guardianName,
  centerLabel,
  email,
  portalUrl,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  portalUrl: string;
}) {
  return [
    `Hi ${guardianName},`,
    "",
    `Your parent portal for ${centerLabel} is ready.`,
    `Use ${email} as your login email.`,
    "Open the password setup email from The BEE Suite to choose your password.",
    "Your child records and classroom connections from the school are already linked in the portal.",
    `After setting your password, sign in here: ${portalUrl}`,
  ].join("\n");
}
