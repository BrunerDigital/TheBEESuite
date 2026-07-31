function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildRegistrationFormCode({
  schoolLabel,
  registrationUrl,
}: {
  schoolLabel: string;
  registrationUrl: string;
}) {
  const safeSchoolLabel = escapeHtmlAttribute(schoolLabel.trim());
  const safeRegistrationUrl = escapeHtmlAttribute(registrationUrl.trim());

  return `<a
  href="${safeRegistrationUrl}"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="Open the registration and enrollment form for ${safeSchoolLabel}"
  style="display:inline-block;padding:12px 18px;border-radius:8px;background:#047857;color:#ffffff;font-family:Arial,sans-serif;font-weight:700;text-decoration:none;"
>
  Start registration for ${safeSchoolLabel}
</a>`;
}
