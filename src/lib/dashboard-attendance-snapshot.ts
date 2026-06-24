export type DashboardAttendanceSnapshotClassroomInput = {
  id: string;
  name: string;
  centerName: string;
  children: Array<{ id: string }>;
};

export type DashboardAttendanceSnapshotLog = {
  type: string;
  occurredAt: Date;
};

export type DashboardAttendanceSnapshotRecord = {
  status: string;
  date: Date;
};

export type DashboardAttendanceSnapshotRow = {
  classroomId: string;
  classroomName: string;
  centerName: string;
  total: number;
  present: number;
  checkedOut: number;
  absent: number;
  notMarked: number;
};

export type DashboardAttendanceSnapshot = {
  scopeLabel: string;
  total: number;
  present: number;
  checkedOut: number;
  absent: number;
  notMarked: number;
  rows: DashboardAttendanceSnapshotRow[];
};

function childAttendanceStatus(input: {
  latestLog?: DashboardAttendanceSnapshotLog;
  latestRecord?: DashboardAttendanceSnapshotRecord;
}) {
  if (input.latestLog?.type === "check_in") return "present";
  if (input.latestLog?.type === "check_out") return "checkedOut";
  if (input.latestRecord?.status === "present") return "present";
  if (input.latestRecord?.status === "checked_out") return "checkedOut";
  if (input.latestRecord?.status === "absent") return "absent";
  return "notMarked";
}

export function buildDashboardAttendanceSnapshot({
  scopeLabel,
  classrooms,
  latestLogByChild,
  latestRecordByChild,
}: {
  scopeLabel: string;
  classrooms: DashboardAttendanceSnapshotClassroomInput[];
  latestLogByChild: Map<string, DashboardAttendanceSnapshotLog>;
  latestRecordByChild: Map<string, DashboardAttendanceSnapshotRecord>;
}): DashboardAttendanceSnapshot {
  const rows = classrooms.map((classroom) => {
    const row: DashboardAttendanceSnapshotRow = {
      classroomId: classroom.id,
      classroomName: classroom.name,
      centerName: classroom.centerName,
      total: classroom.children.length,
      present: 0,
      checkedOut: 0,
      absent: 0,
      notMarked: 0,
    };

    classroom.children.forEach((child) => {
      const status = childAttendanceStatus({
        latestLog: latestLogByChild.get(child.id),
        latestRecord: latestRecordByChild.get(child.id),
      });
      row[status] += 1;
    });

    return row;
  });

  return rows.reduce<DashboardAttendanceSnapshot>(
    (snapshot, row) => ({
      ...snapshot,
      total: snapshot.total + row.total,
      present: snapshot.present + row.present,
      checkedOut: snapshot.checkedOut + row.checkedOut,
      absent: snapshot.absent + row.absent,
      notMarked: snapshot.notMarked + row.notMarked,
      rows: [...snapshot.rows, row],
    }),
    {
      scopeLabel,
      total: 0,
      present: 0,
      checkedOut: 0,
      absent: 0,
      notMarked: 0,
      rows: [],
    },
  );
}
