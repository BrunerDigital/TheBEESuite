export type MessageReplyAudience = "staff" | "parent";
export type MessageReplyTargetMode = "family" | "staff";

type MessageReplyPathInput = {
  audience: MessageReplyAudience;
  replyToMessageId: string;
  subject?: string | null;
  familyId?: string | null;
  staffId?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() ?? "";
}

export function replySubject(subject?: string | null) {
  const value = clean(subject) || "Portal message";
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

export function buildMessageReplyPath({
  audience,
  replyToMessageId,
  subject,
  familyId,
  staffId,
}: MessageReplyPathInput) {
  const params = new URLSearchParams();
  params.set("replyToMessageId", replyToMessageId);
  params.set("subject", replySubject(subject));

  if (audience === "parent") {
    if (familyId) params.set("familyId", familyId);
    return `/parent-portal?${params.toString()}#messages`;
  }

  if (staffId) {
    params.set("targetMode", "staff");
    params.set("staffId", staffId);
  } else if (familyId) {
    params.set("targetMode", "family");
    params.set("familyId", familyId);
  }

  return `/messages?${params.toString()}#message-composer`;
}

export function buildAbsoluteMessageReplyUrl({
  appBaseUrl,
  ...input
}: MessageReplyPathInput & {
  appBaseUrl: string;
}) {
  const path = buildMessageReplyPath(input);
  return `${appBaseUrl.replace(/\/+$/, "")}${path}`;
}

export function appendInAppMessageReplyInstructions(body: string, replyUrl: string) {
  return [
    body.trim(),
    "",
    `Reply in The Bee Suite: ${replyUrl}`,
    "Email replies are not attached to this Bee Suite thread.",
  ].join("\n");
}
