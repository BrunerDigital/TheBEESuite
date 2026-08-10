export const STRIPE_REAUTHORIZATION_SUBJECT_PREFIX = "Action required: Complete BEE Suite Stripe reauthorization";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildStripeReauthorizationInvite(input: {
  schoolName: string;
  reauthorizationUrl: string;
  supportEmail?: string | null;
}) {
  const schoolName = input.schoolName.trim();
  const url = input.reauthorizationUrl.trim();
  const supportEmail = input.supportEmail?.trim() || "support@thebeesuite.io";
  const subject = `${STRIPE_REAUTHORIZATION_SUBJECT_PREFIX} for ${schoolName}`;
  const explanation =
    "To support the payment processes and capabilities requested by schools, The BEE Suite updated how each school is configured through the Stripe API. Completing this secure reauthorization gives The BEE Suite stronger account-level verification and reconciliation for tuition, approved payment accommodations, state-funding allocations, subsidies, and other school payment workflows.";
  const accuracyNote =
    "Stripe securely verifies your business, authorized representative, and payout information. Program eligibility and funding approvals remain with the applicable school and government agency.";
  const text = [
    `Hello ${schoolName} team,`,
    "",
    explanation,
    "",
    "You may recognize this process because it is similar to the original account setup. Please have an authorized business representative complete the secure steps for the school. You may be asked to confirm the legal business name, tax information, representative details, and payout bank.",
    "",
    accuracyNote,
    "",
    "Parent payments can continue during this transition. The existing payout bank is not removed or changed by opening this invitation.",
    "",
    `Start secure reauthorization: ${url}`,
    "",
    `Questions: ${supportEmail}`,
    "",
    "The BEE Suite",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
<tr><td style="background:#111827;padding:24px 30px"><img src="https://thebeesuite.io/brand/the-bee-suite/logo-primary-horizontal-white.png" width="210" alt="The BEE Suite" style="display:block;max-width:100%;height:auto"></td></tr>
<tr><td style="padding:32px 30px">
<div style="display:inline-block;background:#fff3c4;color:#6b4b00;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Secure school account update</div>
<h1 style="font-size:26px;line-height:1.25;margin:18px 0 14px">Complete Stripe reauthorization for ${escapeHtml(schoolName)}</h1>
<p style="font-size:16px;line-height:1.65;margin:0 0 18px">${escapeHtml(explanation)}</p>
<p style="font-size:16px;line-height:1.65;margin:0 0 18px">You may recognize this process because it is similar to the original account setup. An authorized business representative should complete the secure steps for the school.</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:20px 0"><strong>Please have available:</strong><ul style="line-height:1.7;margin:10px 0 0;padding-left:20px"><li>Legal business and tax information</li><li>Authorized representative details</li><li>The school&apos;s payout-bank information</li></ul></div>
<p style="font-size:14px;line-height:1.6;color:#526079;margin:0 0 22px">${escapeHtml(accuracyNote)}</p>
<p style="font-size:14px;line-height:1.6;color:#526079;margin:0 0 24px"><strong>Parent payments can continue during this transition.</strong> Opening this invitation does not remove or change the school&apos;s existing payout bank.</p>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#f4c430;color:#111827;text-decoration:none;font-weight:700;border-radius:10px;padding:14px 20px">Start secure reauthorization</a>
<p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">For security, this button opens The BEE Suite first. Stripe&apos;s one-time handoff is generated only after the authorized representative signs in and confirms the school.</p>
</td></tr>
<tr><td style="border-top:1px solid #e2e8f0;padding:20px 30px;font-size:13px;color:#64748b">Questions? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#334155">${escapeHtml(supportEmail)}</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
