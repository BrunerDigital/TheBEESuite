export type ManualEmailCopy = {
  to: string[];
  subject: string;
  body: string;
  clipboardText: string;
};

export function buildManualEmailCopy({
  to,
  subject,
  body,
}: {
  to: string | string[];
  subject: string;
  body: string;
}): ManualEmailCopy {
  const recipients = (Array.isArray(to) ? to : [to]).map((value) => value.trim()).filter(Boolean);
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();

  return {
    to: recipients,
    subject: normalizedSubject,
    body: normalizedBody,
    clipboardText: [
      `To: ${recipients.join(", ")}`,
      `Subject: ${normalizedSubject}`,
      "",
      normalizedBody,
    ].join("\n"),
  };
}
