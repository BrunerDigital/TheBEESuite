/** Shared source for the launch website, printable guides, and recording scripts. */
export const launchCheckedAt = "2026-09-14";
export type LaunchApp = { name: string; role: string; bundleId: string; url: string | null; verifiedAt: string | null; devices: string };
export const launchApps: LaunchApp[] = [
  { name: "BEE Suite Parent Portal", role: "Parents and guardians", bundleId: "com.brunerdigital.thebeesuite.parent", url: null, verifiedAt: null, devices: "Public compatibility pending verification" },
  { name: "BEE Suite Teacher Portal", role: "Teachers", bundleId: "com.brunerdigital.thebeesuite.teacher", url: null, verifiedAt: null, devices: "Public compatibility pending verification" },
];
export function verifiedStoreUrl(app: LaunchApp): string | null {
  if (!app.url || !app.verifiedAt) return null;
  try { const url = new URL(app.url); return url.protocol === "https:" && url.hostname === "apps.apple.com" && /\/id\d+$/.test(url.pathname) ? app.url : null; } catch { return null; }
}
export const launchSafety = "Use your existing school account. Do not create a duplicate account. Downloading or signing in does not enable autopay or initiate a payment. Schools must receive location-specific approval before inviting staff or families.";
export const launchGuides = [
  { id: "director", title: "Director", login: "/directors", intro: "Prepare your location for a controlled launch, one approved group at a time.", steps: [
    ["Open your workspace", "Use the director web sign-in. Native director availability is not verified. Sign in with your existing email; use Forgot password if needed. Never register again to recover access."],
    ["Confirm the location", "Check the selected school before reviewing or changing anything. Multi-location leaders select an authorized location in the global workspace. If the school is missing or wrong, stop and contact support."],
    ["Review school records", "Check classrooms, assigned staff, children, family links, tuition assignments, and balances against approved school records. Record discrepancies in the readiness tracker. Do not repair balances by creating duplicate invoices, children, or families."],
    ["Onboard staff safely", "After location-specific approval, review existing staff emails and roles before inviting a small authorized test group through the existing invitation workflow. Confirm each teacher sees only the assigned classroom. Do not send a second invitation to solve a role mismatch."],
    ["Pilot with parents", "After staff testing and separate parent-pilot approval, review the exact existing guardian emails and child associations. Invite only the approved group. Ask them to use the email already on file and verify their own children. Pause if any association is wrong."],
    ["Protect billing", "Confirm tuition and balances with the authorized billing owner. Downloading does not charge anyone. One-time payment and autopay authorization are separate choices. Do not enable autopay for families, retry charges, or change financial history during onboarding."],
    ["Approve readiness", "Confirm access, classrooms, staff, families, tuition, billing readiness, staff testing, parent pilot, support ownership, and no unresolved blocker or critical issue. Record approver, date, and evidence before moving to Ready for Full Launch."],
    ["Get help and close safely", "Use the mobile support intake with school, role, time, app/device version, impact, and whether web access works. For urgent child safety or pickup issues, contact the school directly. Sign out on shared devices and verify the portal is no longer accessible."],
  ] },
  { id: "teacher", title: "Teacher", login: "/teachers", intro: "Start with your assigned classroom and keep family information private.", steps: [
    ["Download and sign in", "Use BEE Suite Teacher Portal only when a verified download is shown above; otherwise open the teacher web sign-in. Use your existing staff email and password. Select Forgot password for recovery; ask your director about a missing invitation."],
    ["Confirm classroom access", "Check your school and assigned classroom before opening records. Report missing children, an unexpected classroom, or another school's data immediately. Do not create replacement records or use a colleague's login."],
    ["Attendance", "Open attendance and verify the correct classroom, date, and child. Follow your school's check-in and checkout process. During launch practice, use only designated demo records; do not change real attendance to test a button."],
    ["Daily updates", "Open the child's daily report or updates area. Review the intended child before entering activities or approved media. Follow school consent and privacy rules. Use demo content for training and confirm the final audience before publishing."],
    ["Messages and notifications", "Use the existing classroom messaging workflow for routine family communication. Review recipients before sending. Check notification settings with your director; native push availability is not confirmed, so open the portal regularly. Urgent issues require direct school contact."],
    ["Report and sign out", "For missing access or data, provide school, role, time, app/device version, and whether the web portal works. Send only redacted screenshots. Log out on shared devices; never share passwords or PINs."],
  ] },
  { id: "parent", title: "Parent", login: "/parents", intro: "Your existing school account connects you to your children and family information.", steps: [
    ["Get the correct app", "Choose BEE Suite Parent Portal when its verified download becomes available. Until then, use the parent web sign-in on iPhone, iPad, Android, or desktop. Device compatibility for the public iOS release will be shown with the verified listing."],
    ["Use your existing email", "Use the same email your school already has on file. Accept your school's invitation or choose Forgot password on the parent sign-in page. Do not create another account. If no invitation arrives, check spam and ask the school to confirm your email."],
    ["Recover access", "Request one password-reset email and use its newest link. If it expires, request a new one. If you cannot access that email address, ask the school for help; do not use another guardian's credentials."],
    ["Review your family", "After signing in, confirm the correct school and children. Open updates, communications, and your family profile. If a child is missing or unfamiliar, stop and report it rather than registering the child again."],
    ["View balances and payment options", "Open Payments to review the balance and invoice details. If offered, select a one-time or custom amount and review the amount, method, and any displayed fees before confirming. A balance question should go to your school. Do not submit a payment just to test the app."],
    ["Choose autopay deliberately", "Autopay requires explicit authorization through the separate enrollment flow. Downloading, logging in, or viewing a balance does not enroll you or initiate payment. Existing authorized autopay arrangements continue under their existing terms; contact the school if you have questions."],
    ["Privacy and support", "For account deletion, open Family → Profile & Security → Privacy and Account Deletion, or use the public Support page. Required school, attendance, payment, and audit records may need to be retained. Never send passwords, full bank/card information, or unnecessary child information."],
    ["Use the fallback", "If the app cannot connect, try the parent web portal and record the time and device version. Log out on a shared device and confirm the portal requires sign-in again."],
  ] },
  { id: "kiosk", title: "Kiosk", login: "/check-in", intro: "Use only a school-authorized lobby device with the correct location.", steps: [
    ["Prepare the device", "A director authorizes the school-managed tablet and opens the existing web check-in page. There is no verified separate kiosk App Store app. Use a supported current browser and keep the device charged."],
    ["Confirm the school", "Choose or open the authorized location and check the school name before families use the kiosk. Do not leave a director dashboard or saved personal account visible on the lobby device."],
    ["Restrict the device", "On an authorized iPad, use Settings → Accessibility → Guided Access to restrict use to the kiosk. The school administrator retains the exit passcode. Follow the school's device-management policy; do not publish the passcode or weaken device restrictions."],
    ["Use secure PINs", "Each authorized person uses their own assigned PIN or supported credential. Shield entry from view. Never share a director credential, display a list of PINs, or guess a missing user's PIN."],
    ["Record attendance", "Confirm the displayed child and intended check-in or checkout. Wait for the success confirmation before leaving. Practice only on designated demo records; do not duplicate a real attendance action during testing."],
    ["Handle connectivity or missing users", "If connectivity fails, follow the school's approved manual attendance process and notify the director. Do not assume an action saved or repeatedly submit it. Have an authorized staff member reconcile the record after service returns. Missing users need director review, not a new family account."],
    ["End the session", "An authorized administrator exits Guided Access, ends the kiosk session through the existing controls, and locks the device. Confirm sensitive portals are not accessible. Report issues with school, device, time, and impact, without exposing PINs or child details."],
  ] },
] as const;
export const mobileFaqs = [
  ["Which app should I download?", "Parents use BEE Suite Parent Portal; teachers use BEE Suite Teacher Portal once verified links are shown. Directors, executives, and kiosks can use their role-specific web sign-in below."],
  ["Do existing credentials carry over?", "Yes. Use the email already on file with your school. Do not create a duplicate account. A missing invitation or incorrect role needs school review."],
  ["What if my invitation or password reset is missing?", "Check spam, confirm the email with your school, and use the newest reset link. If your email has changed, contact the school instead of registering again."],
  ["What if I see the wrong school or a missing child/classroom?", "Stop and contact your director or support. Do not create replacement records or use someone else's login. Unexpected access should be reported immediately."],
  ["Does downloading charge me or turn on autopay?", "No. Downloading or signing in does not initiate payment or authorize autopay. Existing authorized autopay remains governed by its existing terms. Review any one-time/custom payment before confirming; new autopay requires explicit consent."],
  ["Can I use the web or Android?", "Yes, use the role-specific web sign-in. No Android store release is verified here. The web application remains the fallback on phones, tablets, and computers."],
  ["Which iOS versions and devices are supported?", "The repository's parent and teacher iOS targets specify iPhone with iOS 16 or later. The approved public binaries and iPad support are not yet verified; check the App Store compatibility panel when links are published."],
  ["How do I report an issue?", "Use the support intake below. Include your school, role, account email, app/device version, time, operational impact, and whether web access works. Redact screenshots. For urgent child safety, health, or pickup needs, contact the school directly."],
] as const;
