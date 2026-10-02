// Notifications point back to the authorized conversation. Storage signatures
// expire and must never turn an email into a permanent bearer download link.
export function messageEmailBodyWithAttachments(body: string, attachments: Array<{ filename: string }>, conversationUrl: string | null) {
  if (!attachments.length) return body;
  const names = attachments.map((attachment) => attachment.filename.replace(/[\r\n]/g, " ").trim()).filter(Boolean);
  return [body, `Attachments (${attachments.length}):\n${names.map((name) => `- ${name}`).join("\n")}`,
    conversationUrl ? `Open the attachments securely in your school conversation:\n${conversationUrl}` : "Sign in to The BEE Suite to open the attachments in this conversation."].filter(Boolean).join("\n\n");
}
