export const PARENT_PORTAL_PATH = "/parent-portal";
export const PARENT_PORTAL_SETUP_PATH = "/parent-portal/setup";
export const PARENT_LOGIN_PATH = "/parents";
export const PARENT_LOGIN_SETUP_PATH = "/parents/setup";
export const PARENT_PORTAL_INVITE_MODE = "bee_suite_default_password";
export const DEFAULT_PARENT_PORTAL_PASSWORD = "BusyBees";

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

export function getParentPortalDefaultPassword() {
  return (process.env.PARENT_PORTAL_DEFAULT_PASSWORD || process.env.PARENT_DEFAULT_PASSWORD || DEFAULT_PARENT_PORTAL_PASSWORD).trim();
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
  const defaultPassword = getParentPortalDefaultPassword();
  return [
    `Hi ${guardianName},`,
    "",
    `Your parent portal for ${centerLabel} is ready.`,
    "",
    "Use these steps:",
    `- Go to: ${portalUrl}`,
    `- Login email: ${email}`,
    `- Default password: ${defaultPassword}`,
    "- Confirm your contact details.",
    "- Create your check-in PIN.",
    "- Add the portal to your phone home screen if you want quick access.",
    "",
    "Your child records and classroom connections from the school are already linked.",
    "You do not have to choose a new password, but you can set one any time from Profile settings after you sign in.",
  ].join("\n");
}
