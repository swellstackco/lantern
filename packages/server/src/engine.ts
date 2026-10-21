/** Turns stored observations into daily series, baselines and alert state. */
import { ALERT_DOMAINS, DOMAIN_SIGMA_FLOOR, BASELINE_DAYS, addDays, baseline, evaluateAlerts, type AlertRecord, type DailyPoint, type Domain, type EvalResult, type Participant } from "@lantern/shared";
import { randomUUID } from "node:crypto";
import type { Repo } from "./storage/repo.js";

export const ALL_DOMAINS: Domain[] = [...ALERT_DOMAINS, "f0Iqr", "wordsPerSec"];

/** Per-day weighted mean of observation scores for each domain. */
export function dailySeries(repo: Repo, participantId: string): Partial<Record<Domain, DailyPoint[]>> {
  const rows = repo.observationsForParticipant(participantId);
  const acc = new Map<string, { sw: number; sv: number; n: number; days: Set<string> }>();
  const out: Partial<Record<Domain, DailyPoint[]>> = {};
  const byKey = new Map<string, { domain: Domain; day: string; sw: number; sv: number; n: number }>();
  for (const r of rows) {
    const k = `${r.domain}|${r.day}`;
    const e = byKey.get(k) ?? { domain: r.domain, day: r.day, sw: 0, sv: 0, n: 0 };
    e.sw += r.weight; e.sv += r.weight * r.score; e.n += 1;
    byKey.set(k, e);
  }
  void acc;
  for (const e of byKey.values()) {
    (out[e.domain] ??= []).push({ day: e.day, value: e.sv / e.sw, weight: e.sw / e.n, nObs: e.n });
  }
  for (const d of Object.keys(out) as Domain[]) out[d]!.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

/** Baseline = first 14 scored days per domain (only once 14 exist). */
export function computeBaselines(series: Partial<Record<Domain, DailyPoint[]>>): Participant["baseline"] {
  const out: Participant["baseline"] = {};
  for (const d of ALL_DOMAINS) {
    const pts = series[d];
    if (pts && pts.length >= BASELINE_DAYS) out[d] = baseline(pts.slice(0, BASELINE_DAYS).map((p) => p.value), pts[BASELINE_DAYS - 1]!.day, DOMAIN_SIGMA_FLOOR[d]);
  }
  return out;
}

export function evaluateParticipant(repo: Repo, p: Participant, asOf: string, series = dailySeries(repo, p.id)): EvalResult {
  const last = repo.listAlerts(p.id).at(-1);
  return evaluateAlerts({ mode: p.mode, asOf, baseline: p.baseline, daily: series, lastAlertOpenedAt: last?.openedAt });
}

/** Recompute baselines, evaluate, open/close the alert record. Returns the evaluation and the alert if one was opened now. */
export function refreshAlerts(repo: Repo, participantId: string, asOf: string): { result: EvalResult; opened?: AlertRecord } {
  const p = repo.getParticipant(participantId);
  if (!p) throw new Error(`no participant ${participantId}`);
  const series = dailySeries(repo, p.id);
  const fresh = computeBaselines(series);
  if (Object.keys(fresh).some((d) => !p.baseline[d as Domain])) { p.baseline = { ...fresh, ...p.baseline }; repo.upsertParticipant(p); }
  const result = evaluateParticipant(repo, p, asOf, series);
  const open = repo.openAlert(p.id);
  let opened: AlertRecord | undefined;
  if (result.status === "notice" && !result.suppressed && !open) {
    opened = { id: randomUUID(), participantId: p.id, level: "notice", domains: result.domains, openedAt: asOf };
    repo.addAlert(opened);
  } else if (open && result.status === "ok" && daysSince(open.openedAt, asOf) >= 14) {
    repo.updateAlert(open.id, { closedAt: asOf });
  }
  return { result, opened };
}
const daysSince = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export { addDays };
