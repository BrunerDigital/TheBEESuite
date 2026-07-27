export const PARENT_PORTAL_PATH = "/parent-portal";
export const PARENT_PORTAL_SETUP_PATH = "/parent-portal/setup";
export const PARENT_LOGIN_PATH = "/parents";
export const PARENT_LOGIN_SETUP_PATH = "/parents/setup";
export const PARENT_PORTAL_INVITE_MODE = "one_time_setup_link";
export const DIRECT_PARENT_PORTAL_INVITE_MODE = "school_issued_first_login_password";
export const DEFAULT_PARENT_INITIAL_PASSWORD = "BusyBees";

type ParentInvitationBranding = {
  name: string;
  tagline: string;
  logoSrc: string;
  logoAlt: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

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
  loginUrl,
  initialPasswordIssued = true,
  initialPassword = DEFAULT_PARENT_INITIAL_PASSWORD,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPasswordIssued?: boolean;
  initialPassword?: string;
}) {
  return [
    `Hi ${guardianName},`,
    "",
    `Your parent portal for ${centerLabel} is ready.`,
    "",
    "Complete these steps in order:",
    `1. Open ${loginUrl}`,
    "2. Sign in with the parent login below.",
    `   Email: ${email}`,
    initialPasswordIssued
      ? `   First-login password: ${initialPassword}`
      : "   Use your current password. Choose Forgot password on the sign-in page if you need a new one.",
    initialPasswordIssued
      ? "   You can keep this password or choose a private password anytime from Parent Portal settings."
      : null,
    "3. Confirm that your name, phone number, children, and school are correct. Stop and contact the school before continuing if anything is wrong.",
    "4. Confirm or change your 4 digit kiosk PIN. The initial PIN is the last 4 digits of your phone number.",
    "5. Finish setup, open the parent portal, and add it to your phone's home screen if you want app-like access.",
    "6. Complete billing or payment setup only if your school separately tells you that those tools are ready.",
    "",
    "In the portal you can read and send messages and view reports, incidents, photos, documents, and school updates. Billing and secure payment options appear only when your school enables them.",
    "For your security, use only an address beginning with https://thebeesuite.io. If Safari says Not Secure, close that page and reopen the secure link above.",
    "The school will never ask you to send your password, bank login, or full card number by email or text.",
  ].filter((line): line is string => line !== null).join("\n");
}

export function buildParentPortalInvitationHtml({
  guardianName,
  centerLabel,
  email,
  loginUrl,
  initialPasswordIssued = true,
  initialPassword = DEFAULT_PARENT_INITIAL_PASSWORD,
  branding,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPasswordIssued?: boolean;
  initialPassword?: string;
  branding: ParentInvitationBranding;
}) {
  const baseUrl = new URL(loginUrl).origin;
  const logoUrl = new URL(branding.logoSrc, `${baseUrl}/`).toString();
  const safeLoginUrl = escapeHtml(loginUrl);
  const passwordBlock = initialPasswordIssued
    ? `<div style="font-size:13px;color:#713f12">FIRST-LOGIN PASSWORD</div><div style="margin-top:4px;font-size:18px;font-weight:700">${escapeHtml(initialPassword)}</div><p style="margin:12px 0 0;font-size:13px;line-height:1.5">You can keep this password or choose a private password anytime from Parent Portal settings.</p>`
    : `<div style="font-size:13px;color:#713f12">PASSWORD</div><div style="margin-top:4px;font-size:15px;line-height:1.5">Use your current password. Choose <strong>Forgot password</strong> on the sign-in page if you need a new one.</div>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr><tr><td style="padding:32px 34px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent app invitation</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Finish your parent portal setup</h1><p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p><p style="font-size:16px;line-height:1.65">${escapeHtml(centerLabel)} has connected your family to the parent portal.</p><div style="margin:22px 0;padding:20px;border-radius:16px;background:#fff8dc;border:1px solid #f4d66d"><div style="font-size:13px;color:#713f12">LOGIN EMAIL</div><div style="margin:4px 0 14px;font-size:18px;font-weight:700">${escapeHtml(email)}</div>${passwordBlock}</div><p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Start Parent Setup</a></p><h2 style="margin-top:28px;font-size:19px">Complete these steps in order</h2><ol style="padding-left:22px;font-size:15px;line-height:1.65"><li>Sign in with the email shown above.</li><li>Confirm your name, phone number, children, and school. Stop and contact the school if anything is wrong.</li><li>Confirm or change your 4 digit kiosk PIN. The initial PIN is the last 4 digits of your phone number.</li><li>Finish setup and open the parent portal.</li><li>Add the portal to your phone's home screen if you want app-like access.</li><li>Complete billing or payment setup only if your school separately tells you those tools are ready.</li></ol><h2 style="margin-top:24px;font-size:19px">What you can do</h2><p style="font-size:15px;line-height:1.65">Read and send messages and view daily reports, incidents, photos, documents, and school updates. Billing and secure payment options appear only when your school enables them.</p></td></tr><tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Never email your password, bank login, or full card number.</td></tr></table></td></tr></table></body></html>`;
}
