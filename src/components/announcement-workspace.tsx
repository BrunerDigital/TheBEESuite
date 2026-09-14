"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnnouncementEmailDelivery } from "@/components/announcement-email-delivery";
import { SchoolDateTime } from "@/components/school-time-zone-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordPaginationNav } from "@/components/record-pagination";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { requestWithNetworkRecovery } from "@/lib/client-request-recovery";
import { announcementCreateId, announcementDraft, announcementDraftSignature, announcementRecordFrom, announcementRecordSignature, isPublishedAnnouncement, isSchoolParentAudience, normalizeAnnouncementDraft, readAnnouncementReceipt, type AnnouncementDraft, type AnnouncementIntent, type AnnouncementRecord } from "@/lib/announcement-workflow";
import type { LinkedRecordPagination } from "@/lib/record-pagination";

type Row = AnnouncementRecord & { center: { name: string; crmLocationId: string | null } | null };
export type AnnouncementWorkspaceData = { centers: Array<{ id: string; name: string }>; announcements: Row[]; pagination?: LinkedRecordPagination; canEdit: boolean; canManagePlatform: boolean; demoMode?: boolean };
type Submission = { id: string; requestId: string; intent: AnnouncementIntent; draft: AnnouncementDraft; source?: AnnouncementRecord; confirmPublishedEdit: boolean; platformWide: boolean };
const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const recoveryMessage = "We could not confirm the saved result. Your entries are still here. Check the saved version before continuing.";
const effectiveSignature = (draft: AnnouncementDraft) => announcementDraftSignature(normalizeAnnouncementDraft(draft));

export function AnnouncementWorkspace({ data }: { data: AnnouncementWorkspaceData }) {
  const router = useRouter();
  const freshDraft = (): AnnouncementDraft => ({ centerId: data.centers.length === 1 ? data.centers[0].id : null, title: "", body: "" });
  const [editor, setEditor] = useState<{ draft: AnnouncementDraft; baseline: string; source?: AnnouncementRecord; scopeChosen: boolean }>(() => { const draft = freshDraft(); return { draft, baseline: effectiveSignature(draft), scopeChosen: Boolean(draft.centerId) }; });
  const [confirmed, setConfirmed] = useState<{ source: Row[]; rows: Row[] }>({ source: data.announcements, rows: [] });
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ submitted: Submission; checked: boolean; record: AnnouncementRecord | null } | null>(null);
  const [pending, startTransition] = useTransition(); const inFlight = useRef(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(data.announcements.length === 0 && data.canEdit);
  const dirty = effectiveSignature(editor.draft) !== editor.baseline;
  const readOnly = !data.canEdit || Boolean(data.demoMode);
  const blocked = pending || emailBusy || Boolean(recovery), source = editor.source;
  const editableSource = !source || (source.centerId ? data.centers.some(center => center.id === source.centerId) : data.canManagePlatform);
  useUnsavedChangesGuard(dirty || Boolean(recovery) || pending, "Your announcement has unsaved or unconfirmed changes. Leave this page and discard these entries?");
  // A server refresh supersedes optimistic rows; never mask another author's newer save.
  const confirmedRows = confirmed.source === data.announcements ? confirmed.rows : [];
  const rows = [...confirmedRows.filter(row => !data.announcements.some(saved => saved.id === row.id)), ...data.announcements.map(row => confirmedRows.find(saved => saved.id === row.id) ?? row)];
  const schoolName = (id: string | null) => id ? data.centers.find(center => center.id === id)?.name ?? rows.find(row => row.centerId === id)?.center?.crmLocationId ?? rows.find(row => row.centerId === id)?.center?.name ?? "Saved school" : "All schools on the platform";

  function load(record?: AnnouncementRecord) {
    if (inFlight.current || emailBusy || ((dirty || recovery) && !window.confirm("Discard these local entries and load the selected saved version? No saved announcement will be deleted."))) return false;
    const draft = record ? announcementDraft(record) : freshDraft();
    const trigger = document.activeElement;
    setEditorOpen(true); setEditor({ draft, baseline: effectiveSignature(draft), source: record, scopeChosen: Boolean(record || draft.centerId) }); setRecovery(null); setMessage(""); setError(""); setInvalidField(null);
    requestAnimationFrame(() => { if (document.activeElement === trigger) document.getElementById(record ? "announcement-title" : "announcement-school")?.focus(); });
    return true;
  }
  function closeEditor() {
    if (blocked || dirty && !window.confirm("Discard the unsaved announcement entries and close the editor? No saved announcement will be deleted.")) return;
    const draft = freshDraft(); setEditor({ draft, baseline: effectiveSignature(draft), scopeChosen: Boolean(draft.centerId) }); setEditorOpen(false); setMessage(""); setError(""); setInvalidField(null);
  }
  function change(key: keyof AnnouncementDraft, value: string) {
    if (inFlight.current || emailBusy || recovery) return;
    setEditor(current => ({ ...current, ...(key === "centerId" ? { scopeChosen: Boolean(value) } : {}), draft: { ...current.draft, [key]: key === "centerId" ? value === "__platform__" ? null : value || null : value } })); setMessage(""); setError(""); setInvalidField(null);
  }
  function remember(record: AnnouncementRecord) {
    const row = { ...record, center: record.centerId ? { name: schoolName(record.centerId), crmLocationId: null } : null };
    setConfirmed(current => ({ source: data.announcements, rows: [...(current.source === data.announcements ? current.rows : []).filter(item => item.id !== record.id), row] }));
  }
  function send(submitted: Submission) {
    if (inFlight.current || readOnly) return;
    inFlight.current = true;
    startTransition(async () => {
      setError(""); setMessage("");
      try {
        const response = await requestWithNetworkRecovery("/api/operations/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "announcement", id: submitted.id || undefined, requestId: submitted.requestId || undefined, intent: submitted.intent, ...submitted.draft, platformWide: submitted.platformWide, confirmPublishedEdit: submitted.confirmPublishedEdit, expectedRecordSignature: submitted.source ? announcementRecordSignature(submitted.source) : undefined }) }, recoveryMessage);
        const json: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = object(json); setError(typeof failure.error === "string" ? failure.error : recoveryMessage);
          if (response.status >= 500 || response.status === 409 || failure.outcomeUnknown === true) setRecovery({ submitted, checked: false, record: null });
          return;
        }
        const record = readAnnouncementReceipt(json, submitted);
        if (!record) { setError(recoveryMessage); setRecovery({ submitted, checked: false, record: null }); return; }
        const draft = announcementDraft(record); setEditor({ draft, baseline: effectiveSignature(draft), source: record, scopeChosen: true }); remember(record); setRecovery(null);
        setMessage(submitted.intent === "publish" ? "Published to the parent portal. No email, SMS or push notification was sent." : isPublishedAnnouncement(record.status) && isSchoolParentAudience(record.audience) ? "Published announcement updated. No message was sent." : record.status === "draft" ? "Draft saved. It is not published and no message was sent." : "Announcement saved. Its existing delivery state was preserved. No message was sent."); router.refresh();
      } finally { inFlight.current = false; }
    });
  }
  function submit(intent: AnnouncementIntent) {
    if (blocked || readOnly || !editableSource) return;
    const draft = normalizeAnnouncementDraft(editor.draft);
    const invalid = !editor.scopeChosen || (!draft.centerId && !data.canManagePlatform) ? "school" : !draft.title ? "title" : !draft.body ? "message" : null;
    if (invalid) { setError(invalid === "school" ? "Choose a school before saving." : invalid === "title" ? "Enter a title before saving." : "Enter a message before saving."); setInvalidField(invalid); document.getElementById(`announcement-${invalid}`)?.focus(); return; }
    if (intent === "save" && source && !dirty) return;
    const updatingPublished = Boolean(source && isPublishedAnnouncement(source.status));
    if (intent === "publish" && (!source || dirty || source.status !== "draft" || !isSchoolParentAudience(source.audience))) return;
    if ((intent === "publish" || updatingPublished) && !window.confirm(`${intent === "publish" ? "Publish this saved announcement" : "Update this announcement's saved text"} for ${schoolName(draft.centerId)}? ${intent === "publish" || isSchoolParentAudience(source?.audience) ? "Parents will see the updated text in the portal. " : "Existing audience and delivery settings will be preserved. "}No email, SMS or push notification will be sent.`)) return;
    send({ id: source?.id ?? "", requestId: source ? "" : crypto.randomUUID(), intent, draft, source, confirmPublishedEdit: updatingPublished, platformWide: !draft.centerId && editor.scopeChosen });
  }
  function checkSaved() {
    if (!recovery || inFlight.current) return;
    const submitted = recovery.submitted, id = submitted.id || announcementCreateId(submitted.requestId);
    if (!id) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const response = await requestWithNetworkRecovery(`/api/communications/announcements/${encodeURIComponent(id)}`, { method: "GET", cache: "no-store" }, "The saved version could not be checked. Your entries are unchanged.");
        const json = object(await response.json().catch(() => null));
        if (!response.ok || json.ok !== true) { setError(typeof json.error === "string" ? json.error : "The saved version could not be checked."); return; }
        const record = announcementRecordFrom(json.record);
        if (json.record !== null && (!record || record.id !== id || record.centerId !== submitted.draft.centerId)) { setError("The saved response did not match this announcement. Your entries are unchanged."); return; }
        setRecovery({ submitted, checked: true, record });
        setMessage(record ? "A saved version was found. Load it to review the current text and publication status." : "No saved record was found. A new draft can be retried using the same protected request; no duplicate will be created.");
      } finally { inFlight.current = false; }
    });
  }
  return <div className="announcement-workspace min-w-0 space-y-4 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 [&_button]:break-words [&_input]:min-h-11">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">Announcements</h1><p className="mt-1 text-sm text-muted-foreground">Draft, review and publish school news to the parent portal.</p></div><Button type="button" variant="outline" disabled={blocked || readOnly} onClick={() => load()}>New announcement</Button></header>
    {data.demoMode ? <p className="rounded-lg border bg-muted/30 p-3 text-sm">Fake preview records only. Saving and publishing are disabled.</p> : null}
    {!data.canEdit ? <p className="rounded-lg border p-3 text-sm">Read-only access. You can read saved announcements; only authorized school staff can edit or publish.</p> : null}
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 ${data.canEdit && editorOpen ? "xl:grid-cols-2" : ""}`}>
      {data.canEdit && editorOpen ? <Card id="announcement-editor" className="min-w-0 gap-3 py-4"><CardHeader className="gap-1 pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle as="h2">{source ? "Edit announcement" : "New draft"}</CardTitle><Button type="button" variant="ghost" size="sm" disabled={blocked} onClick={closeEditor}>Close editor</Button></div><p className="text-sm text-muted-foreground">Publishing here does not send email, SMS or push notifications. Scheduled delivery is not available in this editor.</p></CardHeader><CardContent className="min-w-0 space-y-3">
        {message ? <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">{message}</p> : null}
        {error ? <p id="announcement-validation" role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
        {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
        {recovery ? <div className="space-y-2 rounded-lg border p-3 text-sm"><p>Editing is paused until this saved state is reviewed. Your entries have not been cleared.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={pending} onClick={checkSaved}>Check saved version</Button>{recovery.record ? <Button type="button" disabled={pending} onClick={() => load(recovery.record!)}>Load saved version</Button> : recovery.checked && !recovery.submitted.id ? <Button type="button" disabled={pending} onClick={() => send(recovery.submitted)}>Retry this draft</Button> : null}<Button type="button" variant="outline" disabled={pending} onClick={() => load()}>Discard local entries</Button></div></div> : null}
        {source && !isSchoolParentAudience(source.audience) ? <p className="rounded-lg border p-3 text-sm">This record has targeted or legacy audience settings. They will be preserved. This editor cannot publish it to parents.</p> : null}
        {source && isPublishedAnnouncement(source.status) && isSchoolParentAudience(source.audience) ? <p className="rounded-lg border p-3 text-sm">This announcement is visible to parents. Saving changes updates the published text after confirmation.</p> : null}
        {!editableSource ? <p className="text-sm">This saved notice is read-only in the selected workspace.</p> : null}
        <fieldset disabled={blocked || readOnly || !editableSource} aria-busy={pending} className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1"><Label htmlFor="announcement-school">School</Label><select id="announcement-school" aria-invalid={invalidField === "school"} aria-describedby={invalidField === "school" ? "announcement-validation" : undefined} className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base" value={editor.draft.centerId ?? (editor.scopeChosen ? "__platform__" : "")} disabled={Boolean(source)} onChange={event => change("centerId", event.target.value)}><option value="">Choose a school</option>{data.canManagePlatform || source?.centerId === null ? <option value="__platform__">All schools on the platform</option> : null}{data.centers.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}{source?.centerId && !data.centers.some(center => center.id === source.centerId) ? <option value={source.centerId}>{schoolName(source.centerId)}</option> : null}</select></div>
          <div className="space-y-1"><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" aria-invalid={invalidField === "title"} aria-describedby={invalidField === "title" ? "announcement-validation" : undefined} value={editor.draft.title} maxLength={160} onChange={event => change("title", event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="announcement-message">Message</Label><Textarea id="announcement-message" aria-invalid={invalidField === "message"} aria-describedby={invalidField === "message" ? "announcement-validation" : undefined} className="min-h-32 resize-y" rows={5} maxLength={10000} value={editor.draft.body} onChange={event => change("body", event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><Button type="button" disabled={blocked || Boolean(source && !dirty)} onClick={() => submit("save")}>{pending ? "Working…" : source && isPublishedAnnouncement(source.status) ? "Save published changes" : "Save draft"}</Button><Button type="button" variant="outline" disabled={blocked || !source || dirty || source.status !== "draft" || !isSchoolParentAudience(source.audience)} onClick={() => submit("publish")}>Publish to parent portal</Button></div>
          {!source || dirty ? <p className="text-sm text-muted-foreground">Save your draft before publishing.</p> : null}
        </fieldset>
      </CardContent></Card> : null}
      <section aria-labelledby="saved-announcements-heading" className="min-w-0 space-y-3"><h2 id="saved-announcements-heading" className="text-lg font-semibold">Saved announcements</h2>{data.pagination ? <RecordPaginationNav pagination={data.pagination} label="Announcements" disabled={blocked} /> : null}
        <div className="space-y-3">{rows.map(row => <article key={row.id} className="min-w-0 rounded-xl border bg-card p-3 [overflow-wrap:anywhere]"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 flex-1 basis-40 font-semibold">{row.title}</h3><Badge variant="outline">{isPublishedAnnouncement(row.status) && isSchoolParentAudience(row.audience) ? "Published" : row.status === "draft" ? "Draft" : "Saved legacy state"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.center?.crmLocationId ?? row.center?.name ?? schoolName(row.centerId)}</p>{row.sendAt ? <p className="mt-1 text-xs text-muted-foreground">Saved {row.status === "published" ? "publication" : "delivery"} time: <SchoolDateTime value={row.sendAt} centerId={row.centerId} options={{ month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }} /></p> : null}<details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Read message</summary><p className="whitespace-pre-wrap text-sm leading-6">{row.body}</p></details>{data.canEdit && (row.centerId ? data.centers.some(center => center.id === row.centerId) : data.canManagePlatform) ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={blocked || readOnly} onClick={() => { if (load(row)) document.getElementById("announcement-title")?.focus(); }}>Edit<span className="sr-only"> {row.title}</span></Button>{!readOnly && row.centerId && isPublishedAnnouncement(row.status) && isSchoolParentAudience(row.audience) ? <AnnouncementEmailDelivery id={row.id} centerId={row.centerId} disabled={pending || emailBusy} sendDisabled={blocked || dirty} onBusyChange={setEmailBusy} /> : null}</div> : null}</article>)}</div>
        {!rows.length ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No announcements saved in this view. Start with a school and a short message.</p> : null}
        <p className="text-sm text-muted-foreground">Historical delivery states are preserved. This list is not proof that an email was delivered.</p>
      </section>
    </div>
  </div>;
}
