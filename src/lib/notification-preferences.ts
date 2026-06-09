export type NotificationPreferenceChannelSettings = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

export type NotificationPreferenceRecord = NotificationPreferenceChannelSettings & {
  id?: string;
  userId: string | null;
  role: string | null;
  type: string;
};

export type NotificationPreferenceTarget =
  | { mode: "user"; userId: string; role: string }
  | { mode: "role"; role: string };

export const notificationPreferenceChannelDefaults: Record<string, NotificationPreferenceChannelSettings> = {
  messages: { emailEnabled: true, smsEnabled: false, pushEnabled: true },
  billing: { emailEnabled: true, smsEnabled: false, pushEnabled: true },
  documents: { emailEnabled: true, smsEnabled: false, pushEnabled: true },
  incidents: { emailEnabled: true, smsEnabled: true, pushEnabled: true },
  classroom: { emailEnabled: false, smsEnabled: false, pushEnabled: true },
  enrollment: { emailEnabled: true, smsEnabled: false, pushEnabled: true },
  fte_reports: { emailEnabled: true, smsEnabled: true, pushEnabled: true },
};

export function defaultNotificationPreferenceChannels(type: string): NotificationPreferenceChannelSettings {
  return notificationPreferenceChannelDefaults[type] ?? { emailEnabled: true, smsEnabled: false, pushEnabled: true };
}

export function notificationPreferenceKey(target: NotificationPreferenceTarget, type: string) {
  return target.mode === "role" ? `role:${target.role}:${type}` : `user:${target.userId}:${type}`;
}

export function resolveNotificationPreferenceChannels({
  type,
  target,
  preferences,
}: {
  type: string;
  target: NotificationPreferenceTarget;
  preferences: NotificationPreferenceRecord[];
}) {
  const userPreference = target.mode === "user"
    ? preferences.find((preference) => preference.userId === target.userId && preference.type === type)
    : undefined;
  const rolePreference = preferences.find((preference) => !preference.userId && preference.role === target.role && preference.type === type);
  const resolved = userPreference ?? rolePreference ?? defaultNotificationPreferenceChannels(type);

  return {
    emailEnabled: resolved.emailEnabled,
    smsEnabled: resolved.smsEnabled,
    pushEnabled: resolved.pushEnabled,
    source: userPreference ? "user" : rolePreference ? "role" : "default",
  };
}

export function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
