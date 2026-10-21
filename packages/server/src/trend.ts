import { DOMAIN_META, PRODUCT, addDays, ewma, rci, variabilityIndex, zscore, type Domain, type Participant } from "@lantern/shared";
import { dailySeries, evaluateParticipant, ALL_DOMAINS } from "./engine.js";
import { localDay, now } from "./clock.js";
import type { Repo } from "./storage/repo.js";

export type Audience = "participant" | "caregiver" | "clinician";

export function streakDays(repo: Repo, p: Participant): number {
  const days = new Set(repo.listSessions(p.id, addDays(localDay(p.tz), -120)).map((s) => s.day));
  let d = localDay(p.tz), n = 0;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function seriesData(repo: Repo, p: Participant, days: number) {
  const asOf = localDay(p.tz);
  const from = addDays(asOf, -(days - 1));
  const all = dailySeries(repo, p.id);
  const out = [];
  for (const d of ALL_DOMAINS) {
    const pts = all[d];
    if (!pts?.length) continue;
    const b = p.baseline[d];
    const z = b ? pts.map((x) => zscore(x.value, b, d)) : [];
    const e = b ? ewma(z, 0.2, pts.map((x) => x.weight)) : [];
    const points = pts.map((x, i) => ({ day: x.day, value: Math.round(x.value * 100) / 100, weight: x.weight, z: b ? Math.round(z[i]! * 100) / 100 : null, ewma: b ? Math.round(e[i]! * 100) / 100 : null })).filter((x) => x.day >= from);
    const recent = pts.slice(-14).map((x) => x.value);
    out.push({
      domain: d, label: DOMAIN_META[d].label, experimental: DOMAIN_META[d].experimental, tierB: DOMAIN_META[d].tierB, higherIsBetter: DOMAIN_META[d].polarity === 1,
      baseline: b ? { mu: round(b.mu), sigma: round(b.sigma), r: round(b.r) } : null, points,
      rci: b && recent.length >= 5 ? round(rci(recent, b)) : null, variability: b && recent.length >= 5 ? round(variabilityIndex(recent, b)) : null,
    });
  }
  return out;
}
const round = (x: number) => Math.round(x * 100) / 100;

export function sleepSeries(repo: Repo, p: Participant, days: number) {
  const from = addDays(localDay(p.tz), -(days - 1));
  const m = new Map<string, number>();
  for (const s of repo.listSessions(p.id, from)) if (s.context?.sleepHours != null) m.set(s.day, s.context.sleepHours);
  return [...m.entries()].map(([day, hours]) => ({ day, hours })).sort((a, b) => a.day.localeCompare(b.day));
}

export function getTrend(repo: Repo, p: Participant, audience: Audience, days = 90) {
  const asOf = localDay(p.tz);
  const ev = evaluateParticipant(repo, p, asOf);
  const open = repo.openAlert(p.id);
  const optedIn = repo.getKv(`optin:${p.id}`) === "1";
  const first = p.name.split(" ")[0]!;
  if (audience === "participant") {
    const flagged = ev.status === "notice" || ev.status === "watch";
    const status = flagged ? (optedIn && ev.status === "notice" ? "talk-to-doctor" : "mixed") : "steady";
    const words = status === "steady" ? `Your days look steady, ${first}. Thanks for keeping up.` : status === "mixed" ? `A little up and down lately, ${first}, and that is normal. Let's keep going.` : `Some things have changed a little. This could be a good time to mention it to your doctor.`;
    return { audience, status, words, streakDays: streakDays(repo, p), name: p.name, date: asOf };
  }
  return {
    audience, participant: { id: p.id, name: p.name, age: Number(asOf.slice(0, 4)) - p.birthYear, mode: p.mode }, asOf, days,
    status: ev.status, adherence: Math.round(ev.adherence * 100), flaggedDomains: ev.domains,
    alert: open ? { level: open.level, openedAt: open.openedAt, domains: open.domains } : null,
    alerts: repo.listAlerts(p.id).map((a) => ({ level: a.level, openedAt: a.openedAt, domains: a.domains })),
    series: seriesData(repo, p, days), sleep: sleepSeries(repo, p, days), streakDays: streakDays(repo, p),
    sentence: ev.status === "notice" ? `${first}'s word recall and related measures have been a bit lower than usual for about two weeks.` : ev.status === "not_enough_data" ? `Not enough check-ins yet to say anything.` : `${first}'s check-ins look like her usual.`,
    disclaimer: PRODUCT.disclaimer,
  };
}

export const NOT_MEASURED = ["Diagnosis of any condition", "Physical exams, scans, or blood tests", "Medicines or their effects", "Mood disorders beyond a simple mood word", "Anything said when Alexa was not asked a check-in question"];

export function getDoctorSummary(repo: Repo, p: Participant) {
  const t = getTrend(repo, p, "clinician", 90) as any;
  const enrolls = repo.listEnrollments().filter((e) => e.participantId === p.id).map((e) => e.consentedAt).sort();
  const open = repo.openAlert(p.id);
  return {
    identity: { name: p.name, age: t.participant.age, enrolledSince: enrolls[0]?.slice(0, 10) ?? p.createdAt, city: p.city ?? null },
    asOf: t.asOf, adherence: t.adherence, status: t.status,
    flaggedWindow: open ? { from: addDays(open.openedAt, -13), to: t.asOf, domains: open.domains } : null,
    series: t.series, sleep: t.sleep,
    rciTable: t.series.filter((s: any) => s.rci != null).map((s: any) => ({ domain: s.domain, label: s.label, rci: s.rci, reliableChange: Math.abs(s.rci) > 1.96, experimental: s.experimental })),
    notMeasured: NOT_MEASURED, disclaimer: PRODUCT.disclaimer, generatedAt: now().toISOString(),
  };
}
void (null as unknown as Domain);
