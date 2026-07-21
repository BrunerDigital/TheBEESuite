export const PARENT_PORTAL_PATH = "/parent-portal";
export const PARENT_PORTAL_SETUP_PATH = "/parent-portal/setup";
export const PARENT_LOGIN_PATH = "/parents";
export const PARENT_LOGIN_SETUP_PATH = "/parents/setup";
export const PARENT_PORTAL_INVITE_MODE = "one_time_setup_link";
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
  initialPassword = DEFAULT_PARENT_INITIAL_PASSWORD,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPassword?: string;
}) {
  return [
    `Hi ${guardianName},`,
    "",
    `Your parent portal for ${centerLabel} is ready.`,
    "",
    "Your app and parent portal login:",
    `- Open ${loginUrl}`,
    `- Email: ${email}`,
    `- First-login password: ${initialPassword}`,
    "- You can keep this password or choose a private password anytime from Parent Portal settings.",
    "- Your kiosk PIN is automatically set to the last 4 digits of your phone number. You can change it in the portal.",
    "",
    "In the portal you can securely add a bank account for ACH payments, review invoices and payment history, read and send messages, and view reports, incidents, photos, documents, and school updates.",
    "You can use the portal in your browser or add it to your phone's home screen for app-like access.",
    "The school will never ask you to send your password, bank login, or full card number by email or text.",
  ].join("\n");
}

export function buildParentPortalInvitationHtml({
  guardianName,
  centerLabel,
  email,
  loginUrl,
  initialPassword = DEFAULT_PARENT_INITIAL_PASSWORD,
  branding,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPassword?: string;
  branding: ParentInvitationBranding;
}) {
  const baseUrl = new URL(loginUrl).origin;
  const logoUrl = new URL(branding.logoSrc, `${baseUrl}/`).toString();
  const safeLoginUrl = escapeHtml(loginUrl);
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr><tr><td style="padding:32px 34px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent app invitation</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Your parent portal is ready</h1><p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p><p style="font-size:16px;line-height:1.65">${escapeHtml(centerLabel)} has connected your family to the parent portal.</p><div style="margin:22px 0;padding:20px;border-radius:16px;background:#fff8dc;border:1px solid #f4d66d"><div style="font-size:13px;color:#713f12">LOGIN EMAIL</div><div style="margin:4px 0 14px;font-size:18px;font-weight:700">${escapeHtml(email)}</div><div style="font-size:13px;color:#713f12">FIRST-LOGIN PASSWORD</div><div style="margin-top:4px;font-size:18px;font-weight:700">${escapeHtml(initialPassword)}</div></div><p style="font-size:15px;line-height:1.65"><strong>You can keep this password or choose a private password anytime from Parent Portal settings.</strong></p><p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Open the Parent App</a></p><h2 style="margin-top:28px;font-size:19px">Your kiosk PIN</h2><p style="font-size:15px;line-height:1.65">Your kiosk PIN is automatically set to the last 4 digits of your phone number. You can change it anytime from the portal's kiosk credential settings.</p><h2 style="margin-top:24px;font-size:19px">What you can do</h2><p style="font-size:15px;line-height:1.65">Add a bank account for secure ACH payments, review invoices and payment history, read and send messages, and view daily reports, incidents, photos, documents, and school updates.</p><p style="font-size:15px;line-height:1.65">Use the portal in your browser or add it to your phone's home screen.</p></td></tr><tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Never email your password, bank login, or full card number.</td></tr></table></td></tr></table></body></html>`;
}
