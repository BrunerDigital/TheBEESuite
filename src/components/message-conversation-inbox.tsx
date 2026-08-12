"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckCheck, FileText, Image as ImageIcon, Inbox, MessageCircle, Search, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MessageReplyPanel,
  type MessageFamilyOption,
  type MessageMergeFieldOption,
  type MessageSegmentOptions,
  type MessageStaffOption,
  type MessageTemplateOption,
} from "@/components/message-reply-panel";
import type { MessageAttachmentView } from "@/lib/message-attachments";
import styles from "@/components/message-conversation.module.css";

export type MessageConversationThread = {
  key: string;
  familyId: string | null;
  familyName: string;
  centerLabel: string | null;
  assignedTo: { name: string; email: string } | null;
  unread: number;
  priority: number;
  lastMessageAt: Date | string;
  messages: Array<{
    id: string;
    subject: string | null;
    body: string;
    channel: string;
    priority: string;
    createdAt: Date | string;
    sender: { name: string; email: string; role?: string } | null;
    isFromFamily: boolean;
    attachments?: MessageAttachmentView[];
    replyHref?: string | null;
  }>;
};

type ConversationComposerProps = {
  familyOptions: MessageFamilyOption[];
  templates: MessageTemplateOption[];
  mergeFields: MessageMergeFieldOption[];
  staffOptions: MessageStaffOption[];
  segmentOptions: MessageSegmentOptions;
  currentRole: string;
};

function formatConversationTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("en-US", sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function attachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "F";
}

function MessageAttachments({ attachments }: { attachments?: MessageAttachmentView[] }) {
  if (!attachments?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => attachment.downloadUrl ? (
        <a
          key={attachment.id}
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-current/15 bg-background/30 px-2.5 py-1.5 text-xs font-medium transition hover:bg-background/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={attachment.downloadUrl}
          target="_blank"
          rel="noreferrer"
        >
          {attachment.kind === "image" ? <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" /> : <FileText className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{attachment.filename}</span>
          <span className="shrink-0 opacity-70">{attachmentSize(attachment.size)}</span>
        </a>
      ) : (
        <span key={attachment.id} className="inline-flex max-w-full items-center gap-2 text-xs opacity-70">
          {attachment.kind === "image" ? <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" /> : <FileText className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{attachment.filename}</span>
          <span className="shrink-0">{attachmentSize(attachment.size)}</span>
          <span className="shrink-0">Attachment unavailable</span>
        </span>
      ))}
    </div>
  );
}
export function MessageConversationInbox({
  threads,
  initialThreadKey,
  initialReplyToMessageId,
  initialSearchQuery,
  composer,
}: {
  threads: MessageConversationThread[];
  initialThreadKey?: string | null;
  initialReplyToMessageId?: string | null;
  initialSearchQuery?: string | null;
  composer: ConversationComposerProps;
}) {
  const [query, setQuery] = useState(initialSearchQuery ?? "");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selectedThreadKey, setSelectedThreadKey] = useState(() => {
    if (initialThreadKey && threads.some((thread) => thread.key === initialThreadKey)) return initialThreadKey;
    return threads[0]?.key ?? "";
  });

  function updateBrowserMessagingParam(name: "q" | "familyId", value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateQuery(value: string) {
    setQuery(value);
    updateBrowserMessagingParam("q", value.trim());
  }

  function selectThread(thread: MessageConversationThread) {
    setSelectedThreadKey(thread.key);
    updateBrowserMessagingParam("familyId", thread.familyId ?? "");
  }

  const filteredThreads = useMemo(() => {
    if (!deferredQuery) return threads;
    return threads.filter((thread) => {
      const latestMessage = thread.messages.at(-1);
      return [thread.familyName, thread.centerLabel, latestMessage?.subject, latestMessage?.body]
        .some((value) => value?.toLowerCase().includes(deferredQuery));
    });
  }, [deferredQuery, threads]);

  const selectedThread = filteredThreads.find((thread) => thread.key === selectedThreadKey)
    ?? filteredThreads[0]
    ?? (deferredQuery ? null : threads[0] ?? null);
  const latestMessage = selectedThread?.messages.at(-1) ?? null;
  const replyTarget = selectedThread?.familyId && latestMessage
    ? {
        replyToMessageId: initialReplyToMessageId && selectedThread.key === initialThreadKey
          ? initialReplyToMessageId
          : latestMessage.id,
        targetMode: "family" as const,
        familyId: selectedThread.familyId,
        subject: latestMessage.subject,
      }
    : null;

  return (
    <section className={`${styles.staffShell} min-w-0 overflow-hidden rounded-xl border`} aria-label="Parent conversations">
      <div className="grid min-h-[42rem] min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <aside className={`${styles.conversationList} min-w-0 border-b lg:border-r lg:border-b-0`} aria-label="Family conversation list">
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Conversations</h2>
                <p className="text-xs text-muted-foreground">Select a family to read and reply.</p>
              </div>
              <Badge variant="outline">{threads.length}</Badge>
            </div>
            <label className="relative block">
              <span className="sr-only">Search family conversations</span>
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="conversation-search"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="pl-9"
                placeholder="Search families or messages"
                type="search"
              />
            </label>
          </div>

          <div className={`${styles.threadList} max-h-[24rem] overflow-y-auto lg:max-h-[calc(42rem-7.8rem)]`}>
            {filteredThreads.map((thread) => {
              const lastMessage = thread.messages.at(-1);
              const isSelected = selectedThread?.key === thread.key;
              return (
                <button
                  key={thread.key}
                  type="button"
                  className={`${styles.threadButton} ${isSelected ? styles.threadButtonActive : ""} flex w-full gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
                  aria-pressed={isSelected}
                  onClick={() => selectThread(thread)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary" aria-hidden="true">
                    {initials(thread.familyName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${thread.unread ? "font-semibold" : "font-medium"}`}>{thread.familyName}</span>
                      <span className="shrink-0 text-[0.68rem] text-muted-foreground">{formatConversationTime(thread.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {lastMessage?.isFromFamily ? "Parent: " : "School: "}{lastMessage?.body ?? "No messages yet"}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                      {thread.unread ? <><span className="size-2 rounded-full bg-primary" aria-hidden="true" /><span className="sr-only">{thread.unread} unread messages</span></> : null}
                      <span className="truncate">{thread.centerLabel ?? "School conversation"}</span>
                      {thread.priority ? <span className="font-medium text-destructive">Priority</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
            {!filteredThreads.length ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Search aria-hidden="true" className="mx-auto mb-2 size-5" />
                No conversations match that search.
              </div>
            ) : null}
          </div>
        </aside>

        <div className={`${styles.chatPane} flex min-w-0 flex-col`}>
          {selectedThread ? (
            <>
              <header className={`${styles.smokedHeader} flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">
                    {initials(selectedThread.familyName)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{selectedThread.familyName}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedThread.centerLabel ?? "Family conversation"} · {selectedThread.assignedTo?.name ?? "Unassigned"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge variant="outline" className="gap-1.5">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    {selectedThread.familyId ? "Family conversation" : "Staff conversation"}
                  </Badge>
                  {selectedThread.unread ? <Badge>{selectedThread.unread} unread</Badge> : <Badge variant="outline">Up to date</Badge>}
                  {selectedThread.priority ? <Badge variant="destructive">Priority</Badge> : null}
                </div>
              </header>

              <ol className={`${styles.timeline} flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4 sm:p-6`} aria-label={`Messages with ${selectedThread.familyName}`}>
                {selectedThread.messages.map((message) => (
                  <li key={message.id} className={`flex ${message.isFromFamily ? "justify-start" : "justify-end"}`}>
                    <div className={`flex min-w-0 max-w-[88%] items-end gap-2 sm:max-w-[76%] ${message.isFromFamily ? "" : "flex-row-reverse"}`}>
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${message.isFromFamily ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`} aria-hidden="true">
                        {message.isFromFamily ? <UserRound className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                      </span>
                      <article
                        data-message-origin={message.isFromFamily ? "family" : "school"}
                        className={`${styles.bubble} ${message.isFromFamily ? styles.bubbleFamily : styles.bubbleSchool} min-w-0 break-words rounded-2xl border px-3.5 py-2.5 ${message.isFromFamily ? "rounded-bl-sm" : "rounded-br-sm"}`}
                      >
                        <div className={`mb-1 flex flex-wrap items-center gap-x-2 text-[0.68rem] ${message.isFromFamily ? "text-muted-foreground" : "text-white/65"}`}>
                          <span className="font-medium">{message.isFromFamily ? message.sender?.name ?? "Parent" : message.sender?.name ?? "School"}</span>
                          <span>{formatConversationTime(message.createdAt)}</span>
                          <span className="capitalize">{message.channel.replaceAll("_", " ")}</span>
                        </div>
                        {message.subject ? <div className="mb-1 text-sm font-semibold">{message.subject}</div> : null}
                        <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                        <MessageAttachments attachments={message.attachments} />
                        {!message.isFromFamily ? (
                          <div className="mt-2 flex items-center justify-end gap-1 text-[0.65rem] text-white/60">
                            <CheckCheck className="size-3" aria-hidden="true" />
                            School reply recorded
                          </div>
                        ) : null}
                      </article>
                    </div>
                  </li>
                ))}
              </ol>

              {replyTarget ? (
                <div className={styles.composerShell}>
                  <MessageReplyPanel
                    key={`${selectedThread.key}-${replyTarget.replyToMessageId}`}
                    {...composer}
                    replyDraft={replyTarget}
                    variant="conversation"
                    composerId="message-composer"
                  />
                </div>
              ) : (
                <div className="border-t bg-card/80 p-4 text-sm text-muted-foreground">
                  This thread does not have a family reply target. Use the full composer below.
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Inbox aria-hidden="true" className="mb-3 size-8" />
              <h2 className="font-medium text-foreground">No family conversations yet</h2>
              <p className="mt-1 max-w-sm text-sm">New parent messages will appear here as conversation threads.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
