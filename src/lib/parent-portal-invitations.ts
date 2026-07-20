export const PARENT_PORTAL_PATH = "/parent-portal";
export const PARENT_PORTAL_SETUP_PATH = "/parent-portal/setup";
export const PARENT_LOGIN_PATH = "/parents";
export const PARENT_LOGIN_SETUP_PATH = "/parents/setup";
export const PARENT_PORTAL_INVITE_MODE = "one_time_setup_link";

export function buildParentPortalUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}${PARENT_PORTAL_PATH}`;
}

export function buildParentPortalSetupUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}${PARENT_PORTAL_SETUP_PATH}`;
}

export function buildParentLoginUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}${PARENT_LOGIN_PATH}`;
}

export function buildParentLoginSetupUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}${PARENT_LOGIN_SETUP_PATH}`;
}

export function buildParentPortalInvitationText({
  guardianName,
  centerLabel,
  email,
  setupUrl,
  expiresAt,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  setupUrl: string;
  expiresAt: Date;
}) {
  return [
    `Hi ${guardianName},`,
    "",
    `Your parent portal for ${centerLabel} is ready.`,
    "",
    "Use these steps:",
    `- Open this private one-time link: ${setupUrl}`,
    `- Create a password for ${email}.`,
    "- Confirm your contact details.",
    "- Create your check-in PIN.",
    "- Add the portal to your phone home screen if you want quick access.",
    "",
    `This link expires at ${expiresAt.toISOString()} and stops working after it is used. If it expires, request a fresh password link from the parent login page.`,
    "Your child records and classroom connections from the school are already linked.",
    "Do not forward this link. The school will never ask you to send your password, bank login, or full card number by email or text.",
  ].join("\n");
}
