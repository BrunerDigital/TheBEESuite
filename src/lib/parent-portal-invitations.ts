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
    `Welcome to The BEE Suite. Your parent portal for ${centerLabel} is ready.`,
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
    "5. Add the parent portal to your phone's home screen:",
    "   iPhone or iPad: open the portal in Safari, tap Share, then tap Add to Home Screen.",
    "   Android: open the portal in Chrome, tap the menu, then tap Add to Home screen or Install app.",
    "6. Open Billing in the parent portal. If payment setup is active for your school, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure Stripe form, and return to the portal to confirm your saved method.",
    "   Complete billing or payment setup only if your school separately tells you those tools are ready. If the portal says checkout is not active yet, stop and contact the school.",
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
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr><tr><td style="padding:32px 34px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent app invitation</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Welcome to The BEE Suite</h1><p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p><p style="font-size:16px;line-height:1.65">${escapeHtml(centerLabel)} has connected your family to the parent portal.</p><div style="margin:22px 0;padding:20px;border-radius:16px;background:#fff8dc;border:1px solid #f4d66d"><div style="font-size:13px;color:#713f12">LOGIN EMAIL</div><div style="margin:4px 0 14px;font-size:18px;font-weight:700">${escapeHtml(email)}</div>${passwordBlock}</div><p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Start Parent Setup</a></p><h2 style="margin-top:28px;font-size:19px">Complete these steps in order</h2><ol style="padding-left:22px;font-size:15px;line-height:1.65"><li>Sign in with the email shown above.</li><li>Confirm your name, phone number, children, and school. Stop and contact the school if anything is wrong.</li><li>Confirm or change your 4 digit kiosk PIN. The initial PIN is the last 4 digits of your phone number.</li><li>Finish setup and open the parent portal.</li><li><strong>Add the app to your home screen:</strong> on iPhone or iPad, open in Safari, tap Share, then Add to Home Screen. On Android, open in Chrome, tap the menu, then Add to Home screen or Install app.</li><li><strong>Set up payments when your school enables them:</strong> open Billing, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure Stripe form, and return to the portal to confirm the saved method. If checkout is not active yet, stop and contact the school.</li></ol><h2 style="margin-top:24px;font-size:19px">What you can do</h2><p style="font-size:15px;line-height:1.65">Read and send messages and view daily reports, incidents, photos, documents, and school updates. Billing and secure payment options appear only when your school enables them.</p></td></tr><tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Never email your password, bank login, or full card number.</td></tr></table></td></tr></table></body></html>`;
}

export function buildParentPortalGuideText({
  guardianName,
  centerLabel,
  loginUrl,
  portalUrl,
}: {
  guardianName: string;
  centerLabel: string;
  loginUrl: string;
  portalUrl: string;
}) {
  return [
    `Hi ${guardianName},`,
    "",
    `Welcome to The BEE Suite parent app for ${centerLabel}. Keep this guide for quick answers as your family begins using the portal.`,
    "",
    "QUICK START",
    `1. Sign in at ${loginUrl} with the guardian email on file. New parent accounts start with BusyBees. If you already changed your password, use your current password.`,
    "2. Confirm your family, children, phone number, school, and 4 digit kiosk PIN. Contact the school before changing or recreating a child who is missing or incorrect.",
    "3. Add the app to your home screen:",
    "   iPhone or iPad: open the portal in Safari, tap Share, then tap Add to Home Screen.",
    "   Android: open the portal in Chrome, tap the menu, then tap Add to Home screen or Install app.",
    `4. Open your portal at ${portalUrl}.`,
    "5. If your school has enabled payments, open Billing and choose Set Up Card Autopay or Set Up Instant Bank. Complete the secure Stripe form and return to the portal to confirm the saved method.",
    "",
    "WHAT YOU CAN DO",
    "- View daily reports, classroom activities, photos, incidents, documents, announcements, and family information.",
    "- Read and send school messages from the portal.",
    "- Use your family kiosk PIN or QR code for check-in and pickup when your school enables that workflow.",
    "- Review invoices, balances, receipts, payment methods, and autopay options when billing is active.",
    "",
    "FREQUENTLY ASKED QUESTIONS",
    "I forgot my password. Choose Forgot password on the parent sign-in page. Do not create a second account.",
    "Missing a child? Contact your director so the existing child can be linked safely. Do not add a duplicate child.",
    "My family information is wrong. Stop and contact the school before continuing setup.",
    "The payment buttons are unavailable. Your school may still be completing payout or billing setup. Contact the school and do not send card or bank details by email or text.",
    "Is payment information secure? Card and bank details are entered only on the secure Stripe page. The school and The BEE Suite do not ask you to email your password, bank login, routing details, or full card number.",
    "How do I get help? Reply to your school or contact the director. Include the page and a short description, but never include passwords or payment details.",
    "",
    "For your security, use only an address beginning with https://thebeesuite.io.",
  ].join("\n");
}

export function buildParentPortalGuideHtml({
  guardianName,
  centerLabel,
  loginUrl,
  portalUrl,
  branding,
}: {
  guardianName: string;
  centerLabel: string;
  loginUrl: string;
  portalUrl: string;
  branding: ParentInvitationBranding;
}) {
  const baseUrl = new URL(portalUrl).origin;
  const logoUrl = new URL(branding.logoSrc, `${baseUrl}/`).toString();
  const safeLoginUrl = escapeHtml(loginUrl);
  const safePortalUrl = escapeHtml(portalUrl);
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr><tr><td style="padding:32px 34px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent guide</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Parent app features, FAQ, and quick-start SOP</h1><p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p><p style="font-size:16px;line-height:1.65">Keep this guide for using The BEE Suite parent app for ${escapeHtml(centerLabel)}.</p><p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Open Parent Sign-In</a></p><h2 style="margin-top:28px;font-size:19px">Quick start</h2><ol style="padding-left:22px;font-size:15px;line-height:1.65"><li>Sign in with the guardian email on file. New accounts start with <strong>BusyBees</strong>; use your current password if you already changed it.</li><li>Confirm your family, children, phone number, school, and kiosk PIN. Contact the school before recreating a missing child.</li><li><strong>iPhone or iPad:</strong> open in Safari, tap Share, then Add to Home Screen. <strong>Android:</strong> open in Chrome, tap the menu, then Add to Home screen or Install app.</li><li><a href="${safePortalUrl}">Open the parent portal</a> for daily reports, photos, messages, documents, incidents, announcements, and family information.</li><li>If your school has enabled payments, open Billing, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure Stripe form, and return to confirm the saved method.</li></ol><h2 style="margin-top:24px;font-size:19px">Frequently asked questions</h2><p style="font-size:15px;line-height:1.65"><strong>Forgot your password?</strong> Choose Forgot password on the sign-in page. Do not create a second account.</p><p style="font-size:15px;line-height:1.65"><strong>Missing a child or incorrect information?</strong> Contact your director so the existing record can be corrected or linked safely. Do not add a duplicate.</p><p style="font-size:15px;line-height:1.65"><strong>Payment buttons unavailable?</strong> Your school may still be completing payout or billing setup. Contact the school and never send card or bank details by email or text.</p><p style="font-size:15px;line-height:1.65"><strong>Need help?</strong> Reply to your school or contact the director with the page and a short description. Never include passwords or payment details.</p></td></tr><tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Use only https://thebeesuite.io and enter payment information only on the secure Stripe page.</td></tr></table></td></tr></table></body></html>`;
}
