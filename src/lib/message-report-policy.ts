type MessageReportViewer = {
  id: string;
  tenantId: string;
  role: string;
  centerIds: readonly string[];
  assignedClassroomId?: string | null;
  canAccessEveryCenter: boolean;
};

type ReportableMessage = {
  senderId: string | null;
  assignedToId: string | null;
  threadKey: string | null;
  tenantId: string | null;
  centerId: string | null;
  isFamilyMessage: boolean;
  guardianUserIds: readonly string[];
  currentClassroomIds: readonly string[];
};

export function canReportVisibleMessage(viewer: MessageReportViewer, message: ReportableMessage) {
  if (!message.senderId || message.senderId === viewer.id || message.tenantId !== viewer.tenantId) return false;

  if (message.isFamilyMessage) {
    if (["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"].includes(viewer.role)) {
      return message.guardianUserIds.includes(viewer.id);
    }
    if (viewer.role === "TEACHER") {
      return Boolean(
        message.centerId
        && viewer.centerIds.includes(message.centerId)
        && viewer.assignedClassroomId
        && message.currentClassroomIds.includes(viewer.assignedClassroomId),
      );
    }
    return Boolean(message.centerId && (viewer.canAccessEveryCenter || viewer.centerIds.includes(message.centerId)));
  }

  if (message.threadKey?.startsWith("staff:")) {
    return message.senderId === viewer.id || message.assignedToId === viewer.id;
  }
  if (message.threadKey?.startsWith("internal:") && message.centerId) {
    return viewer.canAccessEveryCenter || viewer.centerIds.includes(message.centerId);
  }
  return false;
}
