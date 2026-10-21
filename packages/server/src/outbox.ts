/** Local outbox: every "email" goes to SQLite and to outbox/<ts>-<kind>.html. No real email or SMS is ever sent. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PRODUCT, type OutboxItem, type Participant } from "@lantern/shared";
import { now } from "./clock.js";
import type { Repo } from "./storage/repo.js";

import { OUTBOX_PATH } from "./paths.js";
import { digestBody, noticeBody } from "./digest.js";
export const OUTBOX_DIR = OUTBOX_PATH;

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function wrapEmail(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F6F1E7;font-family:Georgia,serif;color:#1E2A32"><div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#8a5a12;margin-bottom:16px">${PRODUCT.name}</div>
${bodyHtml}
<hr style="border:none;border-top:1px solid #d9cfba;margin:28px 0 12px"><p style="font-size:13px;color:#4a5a63;line-height:1.5">${esc(PRODUCT.disclaimer)}</p></div></body></html>`;
}

export function enqueueEmail(repo: Repo, o: { to: string; subject: string; html: string; kind: string; attachments?: { name: string; content: string }[] }): OutboxItem {
  const created = now();
  const item: OutboxItem = { id: randomUUID(), channel: "email", to: o.to, subject: o.subject, body: o.html, createdAt: created.toISOString(), kind: o.kind };
  repo.addOutbox(item);
  try {
    mkdirSync(OUTBOX_DIR, { recursive: true });
    const stamp = created.toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(OUTBOX_DIR, `${stamp}-${o.kind}.html`), o.html);
    for (const a of o.attachments ?? []) writeFileSync(join(OUTBOX_DIR, `${stamp}-${a.name}`), a.content);
  } catch { /* file mirror is best effort */ }
  return item;
}

export type NotifyKind = "digest" | "notice" | "urgent" | "custom";
export function plainText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();
}

export function notifyCareCircle(repo: Repo, p: Participant, kind: NotifyKind, opts: { message?: string; subject?: string; bodyHtml?: string; quote?: string } = {}) {
  const first = p.name.split(" ")[0]!;
  let subject: string, body: string;
  if (kind === "urgent") {
    subject = `Please check on ${first} now`;
    body = `<h1 style="font-size:26px;margin:0 0 12px">Please check on ${esc(first)} now</h1><p style="font-size:18px;line-height:1.5">${esc(first)} said something that may mean she needs help right away.</p>${opts.quote ? `<blockquote style="border-left:4px solid #E8A33D;margin:16px 0;padding:4px 16px;font-size:18px">&ldquo;${esc(opts.quote)}&rdquo;</blockquote>` : ""}<p style="font-size:16px">Time: ${esc(now().toLocaleString("en-US", { timeZone: p.tz }))}. ${esc(first)} was told to call 911.</p>`;
  } else if (kind === "notice") {
    subject = `A gentle note about ${first}`;
    body = opts.bodyHtml ?? noticeBody(repo, p);
  } else if (kind === "digest") {
    subject = `${first}'s week`;
    body = opts.bodyHtml ?? (opts.message ? `<h1 style="font-size:26px;margin:0 0 12px">${esc(first)}'s week</h1><p style="font-size:18px">${esc(opts.message)}</p>` : digestBody(repo, p));
  } else {
    subject = opts.subject ?? `A note about ${first}`;
    body = opts.bodyHtml ?? `<p style="font-size:18px;line-height:1.5">${esc(opts.message ?? "")}</p>`;
  }
  const html = wrapEmail(subject, body);
  const items = p.careCircle.map((c) => enqueueEmail(repo, { to: c.email, subject, html, kind }));
  return { delivered: items.length ? ["local-outbox"] : [], to: items.map((i) => i.to), previewText: plainText(body).slice(0, 220) };
}

/** Minimal iCalendar file for a doctor visit. */
export function buildIcs(o: { uid: string; startIso: string; durationMin?: number; summary: string; description: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(o.startIso), end = new Date(start.getTime() + (o.durationMin ?? 45) * 60000);
  const fold = (s: string) => s.replace(/\n/g, "\\n").replace(/,/g, "\\,");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${PRODUCT.name}//EN`, "BEGIN:VEVENT", `UID:${o.uid}@${PRODUCT.slug}.local`, `DTSTAMP:${fmt(now())}`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${fold(o.summary)}`, `DESCRIPTION:${fold(o.description)}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
