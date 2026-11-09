import { TUITION_SCHEDULE_HEADERS, tuitionScheduleCells, type TuitionScheduleRow } from "@/lib/tuition-schedule-report";

export function TuitionScheduleTable({ rows, print = false }: { rows: TuitionScheduleRow[]; print?: boolean }) {
  return (
    <table aria-label="Current child tuition schedule" className={print ? undefined : "w-full min-w-[64rem] text-left text-sm [&_td]:border-t [&_td]:p-3 [&_td]:align-top [&_th]:p-3"}>
      <thead><tr>{TUITION_SCHEDULE_HEADERS.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
      <tbody>
        {rows.map(row => <tr key={row.childId}>{tuitionScheduleCells(row).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
        {!rows.length ? <tr><td colSpan={TUITION_SCHEDULE_HEADERS.length}>No currently enrolled children match the report filters.</td></tr> : null}
      </tbody>
    </table>
  );
}
