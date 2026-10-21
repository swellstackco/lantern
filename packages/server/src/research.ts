import type { Participant } from "@lantern/shared";
import { now } from "./clock.js";
import { evaluateParticipant } from "./engine.js";
import { localDay } from "./clock.js";
import type { Repo } from "./storage/repo.js";
import { seriesData } from "./trend.js";

export function consentSummary(repo: Repo, studyCode: string) {
  const s = repo.getStudy(studyCode);
  if (!s) return undefined;
  return { study: { studyCode: s.studyCode, name: s.name, cadence: s.cadence, piContact: s.piContact }, consentVersion: s.consentVersion, consentText: s.consentText,
    tiers: [{ tier: 1, label: "Tier 1: scores only" }, { tier: 2, label: "Tier 2: scores and your words, with names and places taken out" }] };
}

export function recordConsent(repo: Repo, p: Participant, studyCode: string, tier: 1 | 2, assent: string, proxyName?: string) {
  const s = repo.getStudy(studyCode);
  if (!s) throw new Error(`Unknown study code ${studyCode}`);
  repo.upsertEnrollment({ participantId: p.id, studyCode: s.studyCode, tier, consentVersion: s.consentVersion, consentedAt: now().toISOString(), proxyName });
  repo.setKv(`assent:${p.id}:${s.studyCode}`, assent);
  return { enrolled: true, withdrawPhrase: 'You can stop any time. Just say, "Alexa, tell Lantern to stop sharing my data."' };
}

export function withdraw(repo: Repo, p: Participant, studyCode: string) {
  const e = repo.getEnrollment(p.id, studyCode);
  if (!e) throw new Error("Not enrolled in that study");
  if (!e.withdrawnAt) repo.upsertEnrollment({ ...e, withdrawnAt: now().toISOString() });
  return { withdrawn: true, effective: now().toISOString() };
}

export function studyDashboard(repo: Repo, studyCode: string) {
  const s = repo.getStudy(studyCode);
  if (!s) throw new Error(`Unknown study code ${studyCode}`);
  const enr = repo.listEnrollments(s.studyCode).filter((e) => !e.withdrawnAt);
  const people = enr.map((e, i) => {
    const p = repo.getParticipant(e.participantId)!;
    const ev = evaluateParticipant(repo, p, localDay(p.tz));
    const series = seriesData(repo, p, 90).find((x) => x.domain === "recall");
    return { code: `P-${String(i + 1).padStart(3, "0")}`, tier: e.tier, status: ev.status, adherence: Math.round(ev.adherence * 100), spark: (series?.points ?? []).map((x) => x.value), flagged: ev.status === "notice" };
  });
  const bins = Array.from({ length: 5 }, (_, i) => ({ label: `${i * 20}-${i * 20 + 19}%`, count: 0 }));
  for (const x of people) bins[Math.min(4, Math.floor(x.adherence / 20))]!.count++;
  return { study: { studyCode: s.studyCode, name: s.name, cadence: s.cadence }, enrolled: people.length, withdrawn: repo.listEnrollments(s.studyCode).length - people.length, flags: people.filter((x) => x.flagged).length, adherenceHistogram: bins, participants: people };
}
