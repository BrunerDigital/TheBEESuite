"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DISPLAY_DURATION_MS = 3200;

type SubmissionNotice = {
  id: number;
  detail: string;
};

function submissionDetail(submitter: HTMLElement | null) {
  const customLabel = submitter?.dataset.submittingLabel?.trim();
  if (customLabel) return customLabel;

  const label = submitter?.textContent?.replace(/\s+/g, " ").trim();
  if (!label || label.length > 45) return "Your information is being processed.";

  return `${label.replace(/[.!…]+$/, "")} request received.`;
}

export function SubmissionFeedback() {
  const [notice, setNotice] = useState<SubmissionNotice | null>(null);
  const nextId = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function announceSubmission(event: SubmitEvent) {
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const id = ++nextId.current;

      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      setNotice({ id, detail: submissionDetail(submitter) });
      dismissTimer.current = setTimeout(() => {
        setNotice((current) => current?.id === id ? null : current);
      }, DISPLAY_DURATION_MS);
    }

    document.addEventListener("submit", announceSubmission);
    return () => {
      document.removeEventListener("submit", announceSubmission);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-20 z-[100] flex justify-center sm:inset-x-auto sm:right-5 sm:justify-end">
      {notice ? (
        <div
          key={notice.id}
          className="bee-submission-notice pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-amber-300/25 bg-zinc-950/95 px-4 py-3 text-white shadow-2xl shadow-black/35 backdrop-blur-xl"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/12 text-amber-300">
            <Check className="size-4 opacity-70" aria-hidden="true" />
            <LoaderCircle className="absolute size-7 animate-spin opacity-45" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Submitting…</span>
            <span className="mt-0.5 block text-xs leading-5 text-zinc-300">{notice.detail}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
