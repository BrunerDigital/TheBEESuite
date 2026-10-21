export function operationsRowsToCsv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safe = /^\s*[=+@-]|^[\t\r]/.test(text) ? `'${text}` : text;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadOperationsCsv(
  filename: string,
  rows: (string | number)[][],
) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", operationsRowsToCsv(rows)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
