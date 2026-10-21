/** Weekly digest and notice email bodies. Plain words first; sparklines are inline SVG. */
import { addDays, type Participant } from "@lantern/shared";
import { localDay } from "./clock.js";
import { evaluateParticipant } from "./engine.js";
import { seriesData } from "./trend.js";
import type { Repo } from "./storage/repo.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function sparkSvg(values: number[], band?: { mu: number; sigma: number } | null, w = 220, h = 48): string {
  if (values.length < 2) return "";
  const lo = Math.min(...values, band ? band.mu - band.sigma : Infinity), hi = Math.max(...values, band ? band.mu + band.sigma : -Infinity), d = hi - lo || 1;
  const y = (v: number) => (h - 4 - ((v - lo) / d) * (h - 8)).toFixed(1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${y(v)}`).join(" ");
  const bandRect = band ? `<rect x="0" y="${y(band.mu + band.sigma)}" width="${w}" height="${(Number(y(band.mu - band.sigma)) - Number(y(band.mu + band.sigma))).toFixed(1)}" fill="#CFE3DF"/>` : "";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${bandRect}<polyline fill="none" stroke="#1D5654" stroke-width="2.4" points="${pts}"/></svg>`;
}

const LABELS: Record<string, string> = { recall: "Remembering words", fluency: "Finding words", consistency: "Remembering yesterday" };

function sparkRows(repo: Repo, p: Participant, days: number) {
  return seriesData(repo, p, days).filter((s) => LABELS[s.domain]).map((s) =>
    `<tr><td style="padding:8px 12px 8px 0;font-size:17px;vertical-align:middle">${esc(LABELS[s.domain]!)}</td><td>${sparkSvg(s.points.map((x) => x.value), s.baseline)}</td></tr>`).join("");
}

function weekSentence(repo: Repo, p: Participant): string {
  const first = p.name.split(" ")[0]!;
  const ev = evaluateParticipant(repo, p, localDay(p.tz));
  if (ev.status === "not_enough_data") return `${first} checked in only a few times this week, so there is not much to say yet.`;
  if (ev.status === "notice") return `${first}'s word recall and remembering have been a bit lower than usual for about two weeks.`;
  if (ev.status === "watch") return `${first} had a mostly steady week, with one small change we are keeping an eye on.`;
  if (ev.status === "improving") return `${first} has been doing better than before this week.`;
  return `${first}'s mornings were steady this week.`;
}

export function digestBody(repo: Repo, p: Participant): string {
  const first = p.name.split(" ")[0]!;
  const today = localDay(p.tz), from = addDays(today, -6);
  const days = new Set(repo.listSessions(p.id, from).map((s) => s.day));
  const sleeps = repo.listSessions(p.id, from).map((s) => s.context?.sleepHours).filter((x): x is number => x != null);
  const moods = repo.listSessions(p.id, from).map((s) => s.context?.mood).filter(Boolean) as string[];
  const avgSleep = sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : null;
  const topMood = moods.length ? [...moods.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]![0] : null;
  return `<h1 style="font-size:28px;margin:0 0 10px">${esc(first)}'s week</h1>
<p style="font-size:20px;line-height:1.5;margin:0 0 16px">${esc(weekSentence(repo, p))}</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 12px">${sparkRows(repo, p, 28)}</table>
<p style="font-size:14px;color:#4a5a63;margin:0 0 14px">The green band is ${esc(first)}'s usual range. The line is the last four weeks.</p>
<details><summary style="font-size:16px;cursor:pointer">A few details</summary><ul style="font-size:16px;line-height:1.6"><li>Check-ins on ${days.size} of 7 days</li>${avgSleep ? `<li>Sleep about ${avgSleep} hours a night, as ${esc(first)} told us</li>` : ""}${topMood ? `<li>Most common mood word: ${esc(topMood)}</li>` : ""}</ul></details>`;
}

export function noticeBody(repo: Repo, p: Participant): string {
  const first = p.name.split(" ")[0]!;
  return `<h1 style="font-size:28px;margin:0 0 10px">A gentle note about ${esc(first)}</h1>
<p style="font-size:20px;line-height:1.5">Over the last two weeks, ${esc(first)}'s word recall has been a bit lower than her usual. This can have many causes, like sleep, stress, or a cold. It may be worth a check-up.</p>
<table role="presentation" style="border-collapse:collapse;margin:8px 0 12px">${sparkRows(repo, p, 60)}</table>
<p style="font-size:18px;line-height:1.5">A one-page summary you can bring to the doctor is ready. Ask Alexa to show the doctor summary, or reply to this note and we will send it.</p>
<p style="font-size:18px;line-height:1.5">Want Alexa to add a doctor visit to the calendar? Just ask.</p>`;
}
