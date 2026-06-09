export type RecordsExportSection = {
  id: string;
  title: string;
  description: string;
  filename: string;
  headers: string[];
  rows: unknown[][];
};

export type RecordsExportPackageFile = {
  id: string;
  filename: string;
  contentType: "text/csv";
  description: string;
  recordCount: number;
  content: string;
};

export type RecordsExportPackage = {
  exportType: "licensing_records_package";
  version: 1;
  generatedAt: string;
  generatedBy: {
    userId: string;
    name: string;
    email: string;
    role: string;
  };
  scope: {
    centerCount: number;
    centers: Array<{
      id: string;
      label: string;
      state: string | null;
    }>;
  };
  disclaimer: string;
  manifest: Array<{
    id: string;
    title: string;
    filename: string;
    recordCount: number;
    description: string;
  }>;
  totals: {
    files: number;
    records: number;
  };
  files: RecordsExportPackageFile[];
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export function recordsPackageCsv(headers: string[], rows: unknown[][]) {
  return [csvRow(headers), ...rows.map(csvRow)].join("\n");
}

export function recordsPackageFilename(date = new Date()) {
  return `bee-suite-licensing-records-package-${date.toISOString().slice(0, 10)}.json`;
}

export function buildRecordsExportPackage(input: {
  generatedAt: string;
  generatedBy: RecordsExportPackage["generatedBy"];
  centers: RecordsExportPackage["scope"]["centers"];
  sections: RecordsExportSection[];
}): RecordsExportPackage {
  const files = input.sections.map((section) => ({
    id: section.id,
    filename: section.filename,
    contentType: "text/csv" as const,
    description: section.description,
    recordCount: section.rows.length,
    content: recordsPackageCsv(section.headers, section.rows),
  }));

  return {
    exportType: "licensing_records_package",
    version: 1,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    scope: {
      centerCount: input.centers.length,
      centers: input.centers,
    },
    disclaimer: "This package is a records export for school review, licensing requests, and records requests. It does not certify legal or licensing compliance.",
    manifest: input.sections.map((section) => ({
      id: section.id,
      title: section.title,
      filename: section.filename,
      recordCount: section.rows.length,
      description: section.description,
    })),
    totals: {
      files: files.length,
      records: files.reduce((total, file) => total + file.recordCount, 0),
    },
    files,
  };
}
