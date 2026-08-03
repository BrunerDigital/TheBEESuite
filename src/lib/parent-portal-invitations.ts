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
  transitioningFromProcare = false,
  billingCutoverApproved = false,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPasswordIssued?: boolean;
  initialPassword?: string;
  transitioningFromProcare?: boolean;
  billingCutoverApproved?: boolean;
}) {
  const tuitionTransitionCopy = billingCutoverApproved
    ? [
        "IMPORTANT BILLING CUTOVER",
        `Your school has approved its billing cutover to The BEE Suite. Open Billing in your Parent Portal to review any invoice for ${centerLabel}. Confirm the service period, amount, credits, and due date before paying.`,
        "Do not pay the same tuition charge in both ProCare and The BEE Suite. If the same charge appears in both systems, contact the school before submitting a payment.",
        "An invoice appearing in the portal is not an automatic charge. Autopay applies only after you authorize it. If a payment is pending, do not submit it again.",
      ]
    : [
        "BILLING DURING THE TRANSITION",
        "Continue following your school's current tuition instructions. A Parent Portal invitation or a visible Billing page does not move the next tuition cycle to The BEE Suite.",
        "Your school will confirm the first BEE Suite tuition service period after its billing cutover is approved. Until then, do not submit a payment in The BEE Suite unless the school gives you instructions for the exact charge.",
      ];
  const transitionCopy = transitioningFromProcare
    ? [
        `${centerLabel} is transitioning from ProCare to The BEE Suite. ProCare will remain available alongside The BEE Suite during the transition so teachers and families have time to learn the new system and become comfortable using it. Keep your ProCare access until the school confirms the transition is complete.`,
        "During the transition, some classroom updates may appear in ProCare while teachers begin using The BEE Suite. This temporary overlap is expected.",
        "",
        ...tuitionTransitionCopy,
        "",
      ]
    : [];
  const billingSteps = transitioningFromProcare && billingCutoverApproved
    ? [
        "6. Open Billing in the Parent Portal. Review any invoice, including the family, service period, amount, credits, and due date.",
        "7. Choose an available card or bank option, complete the secure payment form opened from The BEE Suite, and wait for confirmation before leaving or trying again.",
      ]
    : [
        "6. Open Billing in the Parent Portal. If payment setup is active for your school, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure payment form, and return to the portal to confirm your saved method.",
        "   Complete billing or payment setup only if your school separately tells you those tools are ready. If the portal says checkout is not active yet, stop and contact the school.",
      ];
  return [
    `Hi ${guardianName},`,
    "",
    `Welcome to The BEE Suite. Your parent portal for ${centerLabel} is ready.`,
    "",
    ...transitionCopy,
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
    ...billingSteps,
    "",
    "In the portal you can read and send messages and view reports, incidents, photos, documents, and school updates. Billing and secure payment options appear only when your school enables them.",
    "Do not create another family or child record. If a child, balance, guardian, pickup, or other family information is missing or incorrect, contact the school so the existing record can be corrected safely.",
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
  transitioningFromProcare = false,
  billingCutoverApproved = false,
  branding,
}: {
  guardianName: string;
  centerLabel: string;
  email: string;
  loginUrl: string;
  initialPasswordIssued?: boolean;
  initialPassword?: string;
  transitioningFromProcare?: boolean;
  billingCutoverApproved?: boolean;
  branding: ParentInvitationBranding;
}) {
  const baseUrl = new URL(loginUrl).origin;
  const logoUrl = new URL(branding.logoSrc, `${baseUrl}/`).toString();
  const safeLoginUrl = escapeHtml(loginUrl);
  const passwordBlock = initialPasswordIssued
    ? `<div style="font-size:13px;color:#713f12">FIRST-LOGIN PASSWORD</div><div style="margin-top:4px;font-size:18px;font-weight:700">${escapeHtml(initialPassword)}</div><p style="margin:12px 0 0;font-size:13px;line-height:1.5">You can keep this password or choose a private password anytime from Parent Portal settings.</p>`
    : `<div style="font-size:13px;color:#713f12">PASSWORD</div><div style="margin-top:4px;font-size:15px;line-height:1.5">Use your current password. Choose <strong>Forgot password</strong> on the sign-in page if you need a new one.</div>`;
  const billingTransitionBlock = billingCutoverApproved
    ? `<div style="margin-top:16px;padding:15px;border-radius:12px;background:#fff8dc;border:1px solid #f4d66d"><div style="font-size:13px;font-weight:800;color:#713f12">BILLING CUTOVER APPROVED</div><p style="margin:6px 0 0;font-size:15px;line-height:1.65">Your school has approved its billing cutover to The BEE Suite. Open <strong>Billing</strong> in your Parent Portal to review any invoice for ${escapeHtml(centerLabel)}. Confirm the service period, amount, credits, and due date before paying.</p><p style="margin:8px 0 0;font-size:14px;line-height:1.6"><strong>Do not pay the same tuition charge in both systems.</strong> If the same charge appears in ProCare and The BEE Suite, contact the school before submitting a payment. An invoice is not an automatic charge, and autopay applies only after you authorize it.</p></div>`
    : `<div style="margin-top:16px;padding:15px;border-radius:12px;background:#fff8dc;border:1px solid #f4d66d"><div style="font-size:13px;font-weight:800;color:#713f12">BILLING DURING THE TRANSITION</div><p style="margin:6px 0 0;font-size:15px;line-height:1.65">Continue following your school's current tuition instructions. A Parent Portal invitation or a visible Billing page does not move the next tuition cycle to The BEE Suite.</p><p style="margin:8px 0 0;font-size:14px;line-height:1.6">Your school will confirm the first BEE Suite tuition service period after its billing cutover is approved. Until then, do not submit a payment in The BEE Suite unless the school gives you instructions for the exact charge.</p></div>`;
  const transitionBlock = transitioningFromProcare
    ? `<div style="margin:22px 0;padding:20px;border-radius:16px;background:#f8fafc;border:1px solid #d7dee8;border-left:5px solid #f4c430"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a16207">A smooth transition from ProCare</div><h2 style="margin:8px 0 10px;font-size:20px;line-height:1.3">${escapeHtml(centerLabel)} is transitioning from ProCare to The BEE Suite</h2><p style="margin:0;font-size:15px;line-height:1.65">ProCare will remain available alongside The BEE Suite during the transition so teachers and families have time to learn the new system and become comfortable using it. Some classroom updates may appear in ProCare while teachers begin using The BEE Suite. Keep your ProCare access until the school confirms the transition is complete.</p>${billingTransitionBlock}</div>`
    : "";
  const paymentStep = transitioningFromProcare && billingCutoverApproved
    ? `<li><strong>Review an approved tuition invoice:</strong> open Billing, confirm the family, service period, amount, credits, and due date, then choose an available card or bank option. Complete the secure payment form opened from The BEE Suite and wait for confirmation before leaving or trying again.</li>`
    : `<li><strong>Set up payments when your school enables them:</strong> open Billing, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure payment form, and return to the portal to confirm the saved method. If checkout is not active yet, stop and contact the school.</li>`;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden">
            <tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr>
            <tr>
              <td style="padding:32px 34px">
                <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent Portal invitation</div>
                <h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Welcome to The BEE Suite</h1>
                <p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p>
                <p style="font-size:16px;line-height:1.65">${escapeHtml(centerLabel)} has connected your family to the Parent Portal.</p>
                ${transitionBlock}
                <div style="margin:22px 0;padding:20px;border-radius:16px;background:#fff8dc;border:1px solid #f4d66d">
                  <div style="font-size:13px;color:#713f12">LOGIN EMAIL</div>
                  <div style="margin:4px 0 14px;font-size:18px;font-weight:700">${escapeHtml(email)}</div>
                  ${passwordBlock}
                </div>
                <p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Start Parent Setup</a></p>
                <h2 style="margin-top:28px;font-size:19px">Complete these steps in order</h2>
                <ol style="padding-left:22px;font-size:15px;line-height:1.65">
                  <li>Sign in with the email shown above.</li>
                  <li>Confirm your name, phone number, children, and school. Stop and contact the school if anything is wrong.</li>
                  <li>Confirm or change your 4 digit kiosk PIN. The initial PIN is the last 4 digits of your phone number.</li>
                  <li>Finish setup and open the Parent Portal.</li>
                  <li><strong>Add the Parent Portal to your home screen:</strong> on iPhone or iPad, open it in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap the menu, then Add to Home screen or Install app.</li>
                  ${paymentStep}
                </ol>
                <h2 style="margin-top:24px;font-size:19px">What you can do</h2>
                <p style="font-size:15px;line-height:1.65">Read and send messages and view daily reports, incidents, photos, documents, and school updates. Billing and secure payment options appear only when your school enables them.</p>
                <p style="font-size:15px;line-height:1.65"><strong>Something missing or incorrect?</strong> Do not create another family or child record. Contact ${escapeHtml(centerLabel)} so the existing record can be corrected safely.</p>
                <p style="font-size:14px;line-height:1.65;color:#475569">For your security, use only an address beginning with <strong>https://thebeesuite.io</strong>. If Safari says Not Secure, close that page and reopen the secure invitation link above.</p>
              </td>
            </tr>
            <tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Never email your password, bank login, or full card number.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
    `1. Sign in at ${loginUrl} with the guardian email and password in your welcome email. If you need a new password, choose Forgot password on the sign-in page.`,
    "2. Confirm your family, children, phone number, school, and 4 digit kiosk PIN. Contact the school before changing or recreating a child who is missing or incorrect.",
    "3. Add the app to your home screen:",
    "   iPhone or iPad: open the portal in Safari, tap Share, then tap Add to Home Screen.",
    "   Android: open the portal in Chrome, tap the menu, then tap Add to Home screen or Install app.",
    `4. Open your portal at ${portalUrl}.`,
    "5. If your school has enabled payments, open Billing and choose Set Up Card Autopay or Set Up Instant Bank. Complete the secure payment form and return to the portal to confirm the saved method.",
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
    "Is payment information secure? Card and bank details are entered only on the secure processor page opened from The BEE Suite. Stripe may appear there as the regulated payment processor. The school and The BEE Suite do not ask you to email your password, bank login, routing details, or full card number.",
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
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f4f1e8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border:1px solid #e5dfcf;border-radius:22px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#111827"><img src="${escapeHtml(logoUrl)}" width="220" alt="${escapeHtml(branding.logoAlt)}" style="display:block;max-width:80%;height:auto;max-height:110px;object-fit:contain"></td></tr><tr><td style="padding:32px 34px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a16207">${escapeHtml(branding.name)} · Parent guide</div><h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Parent app features, FAQ, and quick-start SOP</h1><p style="font-size:16px;line-height:1.65">Hi ${escapeHtml(guardianName)},</p><p style="font-size:16px;line-height:1.65">Keep this guide for using The BEE Suite parent app for ${escapeHtml(centerLabel)}.</p><p style="text-align:center"><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#f4c430;color:#111827;text-decoration:none;font-weight:800">Open Parent Sign-In</a></p><h2 style="margin-top:28px;font-size:19px">Quick start</h2><ol style="padding-left:22px;font-size:15px;line-height:1.65"><li>Sign in with the guardian email and password in your welcome email. Choose <strong>Forgot password</strong> on the sign-in page if you need a new one.</li><li>Confirm your family, children, phone number, school, and kiosk PIN. Contact the school before recreating a missing child.</li><li><strong>iPhone or iPad:</strong> open in Safari, tap Share, then Add to Home Screen. <strong>Android:</strong> open in Chrome, tap the menu, then Add to Home screen or Install app.</li><li><a href="${safePortalUrl}">Open the parent portal</a> for daily reports, photos, messages, documents, incidents, announcements, and family information.</li><li>If your school has enabled payments, open Billing, choose Set Up Card Autopay or Set Up Instant Bank, complete the secure payment form opened from The BEE Suite, and return to confirm the saved method.</li></ol><h2 style="margin-top:24px;font-size:19px">Frequently asked questions</h2><p style="font-size:15px;line-height:1.65"><strong>Forgot your password?</strong> Choose Forgot password on the sign-in page. Do not create a second account.</p><p style="font-size:15px;line-height:1.65"><strong>Missing a child or incorrect information?</strong> Contact your director so the existing record can be corrected or linked safely. Do not add a duplicate.</p><p style="font-size:15px;line-height:1.65"><strong>Payment buttons unavailable?</strong> Your school may still be completing payout or billing setup. Contact the school and never send card or bank details by email or text.</p><p style="font-size:15px;line-height:1.65"><strong>Need help?</strong> Reply to your school or contact the director with the page and a short description. Never include passwords or payment details.</p></td></tr><tr><td style="padding:20px 34px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.6">${escapeHtml(branding.tagline)} · Use only https://thebeesuite.io and enter payment information only on the secure processor page opened from The BEE Suite.</td></tr></table></td></tr></table></body></html>`;
}
