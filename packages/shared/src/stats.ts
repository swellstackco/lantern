/** Personal-baseline statistics and the drift detector (SPEC section 4). */
import { ALERT_DOMAINS, DOMAIN_META, type BaselineStats, type Domain, type Mode } from "./types.js";

export const EWMA_LAMBDA = 0.2;
export const BASELINE_DAYS = 14;
export const RUN_DAYS = 10;
export const RUN_Z = 0.5;
export const MIN_OBS = 8;
export const SIGNAL_Z = 1.0;
export const SIGNAL_Z_STRONG = 1.5;
export const MIN_ADHERENCE = 0.4;
export const REALERT_DAYS = 14;
export const MIN_SIGMA_FRACTION = 0.05;

export interface DailyPoint { day: string; value: number; weight: number; nObs: number }

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; syy += (y[i]! - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Baseline from the first 14 scored days. r = split-half (odd/even days, Spearman-Brown), floored at 0.5 as a placeholder. */
export function baseline(values: number[], completedOn = ""): BaselineStats {
  const v = values.slice(0, BASELINE_DAYS);
  const mu = mean(v);
  const sigma = Math.max(sd(v), Math.abs(mu) * MIN_SIGMA_FRACTION, 0.05);
  const odd = v.filter((_, i) => i % 2 === 0), even = v.filter((_, i) => i % 2 === 1);
  const n = Math.min(odd.length, even.length);
  let r = 0.5;
  if (n >= 3) { const rh = pearson(odd.slice(0, n), even.slice(0, n)); r = Math.min(0.95, Math.max(0.5, (2 * rh) / (1 + rh || 1))); }
  return { mu, sigma, r, n: v.length, completedOn };
}

/** z-score with polarity, so that negative always means "worse than your usual". */
export function zscore(x: number, b: BaselineStats, domain: Domain): number {
  return (DOMAIN_META[domain].polarity * (x - b.mu)) / b.sigma;
}

/** Weighted EWMA over scored days. Effective smoothing per day = lambda * weight. Starts at 0 (= baseline). */
export function ewma(z: number[], lambda = EWMA_LAMBDA, w: number[] = []): number[] {
  const out: number[] = [];
  let e = 0;
  for (let i = 0; i < z.length; i++) { e = e + lambda * (w[i] ?? 1) * (z[i]! - e); out.push(e); }
  return out;
}

/** Reliable Change Index of the recent mean against baseline. |RCI| > 1.96 is reliable change. */
export function rci(recent: number[], b: BaselineStats): number {
  const denom = Math.SQRT2 * b.sigma * Math.sqrt(1 - b.r);
  return denom ? (mean(recent) - b.mu) / denom : 0;
}

/** Rolling-window coefficient of variation divided by baseline coefficient of variation. */
export function variabilityIndex(recent: number[], b: BaselineStats): number {
  const cv = (m: number, s: number) => (Math.abs(m) > 1e-9 ? s / Math.abs(m) : 0);
  const base = cv(b.mu, b.sigma);
  return base ? cv(mean(recent), sd(recent)) / base : 0;
}

export type AlertStatus = "ok" | "watch" | "notice" | "improving" | "not_enough_data";
export interface DomainEval { z: number[]; ewma: number[]; lastEwma: number; trailingMean: number; qualifies: boolean; qualifiesStrong: boolean; obs: number }
export interface EvalInput {
  mode: Mode;
  asOf: string; // YYYY-MM-DD inclusive
  baseline: Partial<Record<Domain, BaselineStats>>;
  daily: Partial<Record<Domain, DailyPoint[]>>;
  lastAlertOpenedAt?: string;
}
export interface EvalResult {
  status: AlertStatus; adherence: number; domains: Domain[]; perDomain: Partial<Record<Domain, DomainEval>>; suppressed: boolean; reason?: string;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

function evalDomain(domain: Domain, pts: DailyPoint[], b: BaselineStats, sign: number): DomainEval {
  const z = pts.map((p) => sign * zscore(p.value, b, domain));
  const e = ewma(z, EWMA_LAMBDA, pts.map((p) => p.weight));
  const trailingMean = mean(z.slice(-RUN_DAYS));
  let run = 0;
  for (let i = e.length - 1; i >= 0 && e[i]! <= -RUN_Z; i--) run++;
  const obs = pts.slice(-RUN_DAYS).reduce((s, p) => s + p.nObs, 0);
  const lastEwma = e.length ? e[e.length - 1]! : 0;
  const enough = pts.length >= RUN_DAYS && obs >= MIN_OBS;
  const at = (L: number) => enough && run >= RUN_DAYS && lastEwma <= -L;
  return { z, ewma: e, lastEwma, trailingMean, qualifies: at(SIGNAL_Z), qualifiesStrong: at(SIGNAL_Z_STRONG), obs };
}

/**
 * Drift rule. A domain qualifies when its EWMA has stayed at or below -0.5 for 10 or more consecutive scored days
 * (>= 8 observations in that window) and is at or below -1.0 today. Notice = 2+ domains qualify, or 1 domain at -1.5. Watch = 1 domain qualifies.
 * One bad day cannot qualify (a z of -3 moves the EWMA by only -0.6, and it decays back within a few days).
 */
export function evaluateAlerts(input: EvalInput): EvalResult {
  const sign = input.mode === "recovery" ? -1 : 1;
  const perDomain: Partial<Record<Domain, DomainEval>> = {};
  const scoredDays = new Set<string>();
  for (const d of ALERT_DOMAINS) {
    const b = input.baseline[d];
    const pts = (input.daily[d] ?? []).filter((p) => p.day <= input.asOf);
    pts.forEach((p) => scoredDays.add(p.day));
    if (!b || !pts.length) continue;
    perDomain[d] = evalDomain(d, pts, b, sign);
  }
  const from = addDays(input.asOf, -13);
  const adherence = [...scoredDays].filter((d) => d >= from && d <= input.asOf).length / 14;
  const none = (status: AlertStatus, reason: string): EvalResult => ({ status, adherence, domains: [], perDomain, suppressed: false, reason });
  if (!Object.keys(perDomain).length) return none("not_enough_data", "no baseline yet");
  if (adherence < MIN_ADHERENCE) return none("not_enough_data", "low adherence");
  const qualifying = (Object.keys(perDomain) as Domain[]).filter((d) => perDomain[d]!.qualifies);
  const strong = qualifying.filter((d) => perDomain[d]!.qualifiesStrong);
  const fires = qualifying.length >= 2 || strong.length >= 1;
  if (input.mode === "recovery") return { status: fires ? "improving" : "ok", adherence, domains: qualifying, perDomain, suppressed: false };
  if (fires) {
    const suppressed = !!input.lastAlertOpenedAt && daysBetween(input.lastAlertOpenedAt.slice(0, 10), input.asOf) < REALERT_DAYS && daysBetween(input.lastAlertOpenedAt.slice(0, 10), input.asOf) > 0;
    return { status: "notice", adherence, domains: qualifying, perDomain, suppressed };
  }
  return { status: qualifying.length ? "watch" : "ok", adherence, domains: qualifying, perDomain, suppressed: false };
}

/** First day on which the notice rule fires, scanning forward (used by the seed script and charts). */
export function firstNoticeDay(input: Omit<EvalInput, "asOf">, days: string[]): string | undefined {
  for (const d of days) if (evaluateAlerts({ ...input, asOf: d }).status === "notice") return d;
  return undefined;
}
