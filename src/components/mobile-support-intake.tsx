"use client";

import { useState } from "react";

const fields = [
  ["school", "School", "text"], ["role", "User role", "text"], ["email", "Account email", "email"],
  ["app", "App name and version (or web)", "text"], ["device", "Device and iOS/browser version", "text"],
  ["time", "When did it happen? Include time zone", "text"],
] as const;
const inputClass = "mt-2 w-full rounded-xl border border-slate-400 bg-white p-3 text-slate-950 focus:outline-2 focus:outline-offset-2 focus:outline-blue-700";

export function MobileSupportIntake() {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  return <form className="grid gap-5" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCopied(false);
    setMessage([
      ...fields.map(([key, label]) => `${label}: ${data.get(key) ?? ""}`),
      ...["Category", "Description", "Web version works", "Operational impact", "Screenshot"].map((label) => `${label}: ${data.get(label) ?? ""}`),
    ].join("\n\n"));
  }}>
    <p className="text-sm leading-6">Prepare a report for support@thebeesuite.io. This form keeps your entries in this page until you choose to email them; it does not create a ticket automatically. Never include passwords, PINs, full bank information, full card information, or unnecessary child information. Contact your school directly for urgent safety or pickup needs.</p>
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="text-sm font-semibold">{label}<input className={inputClass} name={key} type={type} required maxLength={180} autoComplete={key === "email" ? "email" : "off"} /></label>)}</div>
    <label className="text-sm font-semibold">Issue category<select className={inputClass} name="Category"><option>Login or password reset</option><option>Wrong school or permissions</option><option>Missing child or classroom</option><option>Attendance or kiosk</option><option>Updates or messaging</option><option>Balance or payment interface</option><option>Privacy or security</option><option>Other</option></select></label>
    <label className="text-sm font-semibold">Description<textarea className={inputClass} name="Description" required rows={4} maxLength={2500} /></label>
    <label className="text-sm font-semibold">Does the web version work?<select className={inputClass} name="Web version works"><option>Not tested</option><option>Yes</option><option>No</option></select></label>
    <label className="text-sm font-semibold">Operational impact<select className={inputClass} name="Operational impact"><option>Question or minor inconvenience</option><option>One user blocked; workaround available</option><option>Classroom or school workflow blocked</option><option>Unexpected access or privacy concern</option></select></label>
    <label className="text-sm font-semibold">Screenshot<select className={inputClass} name="Screenshot"><option>No screenshot</option><option>I will attach a redacted screenshot to the email</option><option>I need a secure upload path</option></select></label>
    <p className="text-sm">Attach a redacted screenshot in your email app after reviewing it. Files are not uploaded here. Ask support for a secure upload path if redaction is insufficient.</p>
    <button className="min-h-12 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white" type="submit">Prepare support report</button>
    {message && <div className="grid gap-3 rounded-xl bg-blue-50 p-4" aria-live="polite"><p className="font-semibold">Report prepared — not sent</p><textarea aria-label="Prepared support report" className={inputClass} rows={10} readOnly value={message} /><a className="min-h-11 rounded-xl bg-amber-300 p-3 text-center font-semibold text-slate-950" href={`mailto:support@thebeesuite.io?subject=${encodeURIComponent("BEE Suite mobile support")}&body=${encodeURIComponent(message)}`}>Open email to review and send</a><button type="button" className="min-h-11 underline" onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy report"}</button><p className="text-sm">If no email app opens, copy the report into an email to support@thebeesuite.io. Sending and delivery are separate from preparing this report.</p></div>}
  </form>;
}
