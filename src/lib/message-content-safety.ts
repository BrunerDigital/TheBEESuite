export const MESSAGE_CONTENT_POLICY_VERSION = "2026-09-08";

export type MessageContentSafetyResult = {
  allowed: boolean;
  category: "clear" | "hidden_control" | "unsafe_link" | "direct_threat" | "sexual_solicitation" | "credential_request";
  policyVersion: typeof MESSAGE_CONTENT_POLICY_VERSION;
};

const blockedPatterns: Array<{ category: Exclude<MessageContentSafetyResult["category"], "clear" | "hidden_control">; pattern: RegExp }> = [
  {
    category: "unsafe_link",
    pattern: /\b(?:javascript|vbscript)\s*:|\bdata\s*:\s*(?:text\/html|image\/svg\+xml|application\/(?:javascript|xhtml\+xml))/iu,
  },
  {
    category: "direct_threat",
    pattern: /\b(?:i(?:'|’)ll|i\s+will|we\s+will|going\s+to|gonna)\s+(?:kill|shoot|stab|murder|beat|hurt)\s+(?:you|him|her|them|everyone)\b/iu,
  },
  {
    category: "sexual_solicitation",
    pattern: /\b(?:send|show|share)\b.{0,32}\b(?:nude|nudes|explicit\s+(?:photo|video|picture)s?)\b/iu,
  },
  {
    category: "credential_request",
    pattern: /\b(?:send|share|give)\b.{0,40}\b(?:password|verification\s+code|routing\s+number|bank\s+account|social\s+security\s+number)\b/iu,
  },
];

export function screenMessageContent(subject: string, body: string): MessageContentSafetyResult {
  const value = `${subject}\n${body}`.normalize("NFKC");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(value)) {
    return { allowed: false, category: "hidden_control", policyVersion: MESSAGE_CONTENT_POLICY_VERSION };
  }
  const blocked = blockedPatterns.find(({ pattern }) => pattern.test(value));
  return blocked
    ? { allowed: false, category: blocked.category, policyVersion: MESSAGE_CONTENT_POLICY_VERSION }
    : { allowed: true, category: "clear", policyVersion: MESSAGE_CONTENT_POLICY_VERSION };
}

export function messageContentSafetyMetadata(result: MessageContentSafetyResult) {
  return {
    status: result.allowed ? "screened" : "blocked",
    policyVersion: result.policyVersion,
  };
}
