import crypto from "node:crypto";

const APPLY_FLAG = "--apply-fleet-past-procare-enrollments";
const CUTOFF = new Date("2026-08-04T23:59:59.999Z");
const CURRENT_STATUSES = new Set(["enrolled", "active", "current"]);

function pastSourceEndDate(customFields: unknown) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return false;
  const value = String((customFields as Record<string, unknown>).enrollmentEndDate ?? "").trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match || Number(match[3]) >= 2070) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const valid = end.getUTCFullYear() === year && end.getUTCMonth() === month - 1 && end.getUTCDate() === day;
  return valid && end <= CUTOFF;
}

async function main() {
  const baseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error("Supabase REST credentials are required.");
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  async function read<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
    if (!response.ok) throw new Error(`Supabase read failed (${response.status}).`);
    return response.json() as Promise<T>;
  }

  const centers = await read<Array<{ id: string; name: string; status: string }>>("Center?select=id,name,status&order=name.asc&limit=1000");
  const candidates: Array<{ id: string; enrollmentStatus: string; classroomId: string | null; centerName: string }> = [];
  const schoolAudit: Array<{ center: string; status: string; procareChildren: number; candidates: number }> = [];
  for (const center of centers) {
    const families = await read<Array<{ id: string }>>(`Family?centerId=eq.${center.id}&select=id&limit=1000`);
    if (!families.length) {
      schoolAudit.push({ center: center.name, status: center.status, procareChildren: 0, candidates: 0 });
      continue;
    }
    const familyIds = families.map((family) => family.id);
    const children: Array<{ id: string; enrollmentStatus: string; classroomId: string | null; customFields: unknown }> = [];
    for (let offset = 0; offset < familyIds.length; offset += 75) {
      children.push(...await read<typeof children>(
        `Child?familyId=in.(${familyIds.slice(offset, offset + 75).join(",")})&sourceSystem=eq.procare&select=id,enrollmentStatus,classroomId,customFields&order=id.asc&limit=1000`,
      ));
    }
    const schoolCandidates = children
      .filter((child) => CURRENT_STATUSES.has(child.enrollmentStatus) && pastSourceEndDate(child.customFields))
      .map((child) => ({ ...child, centerName: center.name }));
    candidates.push(...schoolCandidates);
    schoolAudit.push({ center: center.name, status: center.status, procareChildren: children.length, candidates: schoolCandidates.length });
  }

  const fingerprint = crypto.createHash("sha256").update(candidates.map((child) => child.id).sort().join("\n")).digest("hex");
  console.log(JSON.stringify({ cutoff: CUTOFF.toISOString(), schools: schoolAudit.filter((row) => row.procareChildren || row.candidates), candidates: candidates.length, fingerprint, apply: process.argv.includes(APPLY_FLAG) }, null, 2));
  if (!process.argv.includes(APPLY_FLAG)) return;

  let updated = 0;
  for (const child of candidates) {
    const classroomFilter = child.classroomId ? `classroomId=eq.${child.classroomId}` : "classroomId=is.null";
    const response = await fetch(
      `${baseUrl}/rest/v1/Child?id=eq.${child.id}&enrollmentStatus=eq.${child.enrollmentStatus}&${classroomFilter}`,
      { method: "PATCH", headers: { ...headers, prefer: "return=representation" }, body: JSON.stringify({ enrollmentStatus: "withdrawn", classroomId: null }) },
    );
    if (!response.ok) throw new Error(`Supabase update failed (${response.status}) after ${updated} updates.`);
    const result = await response.json() as Array<{ id: string }>;
    if (result.length !== 1) throw new Error(`A ${child.centerName} child changed after review; stopped after ${updated} updates.`);
    updated += 1;
  }
  console.log(JSON.stringify({ updated, expected: candidates.length }, null, 2));
}

main();
