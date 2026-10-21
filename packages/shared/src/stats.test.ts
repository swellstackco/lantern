import { describe, expect, it } from "vitest";
import { addDays, baseline, evaluateAlerts, ewma, firstNoticeDay, rci, variabilityIndex, zscore, type DailyPoint, type Domain } from "./index.js";

const START = "2026-01-01";
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

/** Build a series: 14 baseline days around mu/sigma, then `n` days at z-shift (in sigma units). */
function series(opts: { n: number; shiftZ?: (i: number) => number; mu?: number; sigma?: number; seed?: number; adherence?: number; domain?: Domain; weightAt?: (i: number) => number }) {
  const { mu = 2.6, sigma = 0.5, seed = 7, adherence = 1 } = opts;
  const r = rng(seed); const pts: DailyPoint[] = [];
  for (let i = 0; i < opts.n; i++) {
    const keep = ((i * 7) % 10) / 10 < adherence; const rr = r(); void rr; if (!keep) continue;
    const z = i < 14 ? gauss(r) * 0.8 : (opts.shiftZ?.(i - 14) ?? 0) + gauss(r) * 0.3;
    pts.push({ day: addDays(START, i), value: mu + z * sigma, weight: opts.weightAt?.(i) ?? 1, nObs: 2 });
  }
  return pts;
}
function setup(pts: Record<string, DailyPoint[]>) {
  const baselineMap: Record<string, ReturnType<typeof baseline>> = {};
  const PARAMS: Record<string, [number, number]> = { recall: [2.6, 0.5], fluency: [11, 2], consistency: [1.8, 0.4] };
  for (const d of Object.keys(pts)) baselineMap[d] = { mu: PARAMS[d]![0], sigma: PARAMS[d]![1], r: 0.7, n: 14, completedOn: "" };
  return { mode: "atRisk" as const, baseline: baselineMap, daily: pts };
}
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(START, i));

describe("primitives", () => {
  it("ewma: one z=-3 day moves it by -0.6", () => expect(ewma([-3])[0]).toBeCloseTo(-0.6, 5));
  it("ewma decays after the outlier", () => { const e = ewma([-3, 0, 0, 0, 0, 0]); expect(e[5]).toBeGreaterThan(-0.25); });
  it("ewma half weight moves half as far", () => expect(ewma([-3], 0.2, [0.5])[0]).toBeCloseTo(-0.3, 5));
  it("baseline mean and sd", () => { const b = baseline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]); expect(b.mu).toBeCloseTo(7.5); expect(b.sigma).toBeCloseTo(4.18, 1); });
  it("zscore respects polarity (higher fillers is worse)", () => { const b = { mu: 1, sigma: 1, r: 0.7, n: 14, completedOn: "" }; expect(zscore(3, b, "fillers")).toBe(-2); expect(zscore(3, b, "recall")).toBe(2); });
  it("rci is large for a real shift and small for none", () => {
    const b = { mu: 2.6, sigma: 0.5, r: 0.7, n: 14, completedOn: "" };
    expect(Math.abs(rci([1.7, 1.6, 1.8], b))).toBeGreaterThan(1.96); expect(Math.abs(rci([2.6, 2.7, 2.5], b))).toBeLessThan(1.96);
  });
  it("variability index is 1 for same variability", () => { const b = baseline([2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3]); expect(variabilityIndex([2, 3, 2, 3, 2, 3], b)).toBeGreaterThan(0.8); });
});

describe("evaluateAlerts", () => {
  it("(a) stable series never alerts", () => {
    const pts = { recall: series({ n: 90, seed: 1 }), fluency: series({ n: 90, seed: 2, mu: 11, sigma: 2 }) };
    expect(firstNoticeDay(setup(pts), days(90))).toBeUndefined();
    expect(evaluateAlerts({ ...setup(pts), asOf: days(90)[89]! }).status).toBe("ok");
  });
  it("(b) one outlier day z=-3 does not alert", () => {
    const mk = (seed: number, mu: number, sigma: number) => series({ n: 60, seed, mu, sigma, shiftZ: (i) => (i === 10 ? -3 : 0) });
    const pts = { recall: mk(3, 2.6, 0.5), fluency: mk(4, 11, 2), consistency: mk(5, 1.8, 0.4) };
    expect(firstNoticeDay(setup(pts), days(60))).toBeUndefined();
  });
  it("(c) 30-day sustained -1.2 drift in 2 domains opens an alert on drift day 10-14", () => {
    const mk = (seed: number, mu: number, sigma: number) => series({ n: 14 + 30, seed, mu, sigma, shiftZ: () => -1.2 });
    const pts = { recall: mk(11, 2.6, 0.5), fluency: mk(12, 11, 2) };
    const day = firstNoticeDay(setup(pts), days(44));
    expect(day).toBeDefined();
    const driftDay = days(44).indexOf(day!) - 14 + 1; // 1-based day of drift
    expect(driftDay).toBeGreaterThanOrEqual(10); expect(driftDay).toBeLessThanOrEqual(14);
  });
  it("one domain alone at -1.2 is only a watch", () => {
    const pts = { recall: series({ n: 44, seed: 21, shiftZ: () => -1.2 }), fluency: series({ n: 44, seed: 22, mu: 11, sigma: 2 }) };
    expect(evaluateAlerts({ ...setup(pts), asOf: days(44)[43]! }).status).toBe("watch");
  });
  it("one domain at -2 is a notice", () => {
    const pts = { recall: series({ n: 44, seed: 31, shiftZ: () => -2 }), fluency: series({ n: 44, seed: 32, mu: 11, sigma: 2 }) };
    expect(evaluateAlerts({ ...setup(pts), asOf: days(44)[43]! }).status).toBe("notice");
  });
  it("(d) adherence 30% is not_enough_data even with deep drift", () => {
    const mk = (seed: number, mu: number, sigma: number) => series({ n: 60, seed, mu, sigma, adherence: 0.3, shiftZ: () => -2 });
    const pts = { recall: mk(41, 2.6, 0.5), fluency: mk(42, 11, 2) };
    const s = setup(pts);
    expect(evaluateAlerts({ ...s, asOf: days(60)[59]! }).status).toBe("not_enough_data");
  });
  it("down-weighted bad days count less", () => {
    const mk = (seed: number) => series({ n: 40, seed, shiftZ: (i) => (i >= 3 && i < 13 ? -1.3 : 0), weightAt: () => 0.5 });
    // half weight makes the EWMA move slowly: no alert from a 10-day dip
    const pts = { recall: mk(51), fluency: series({ n: 40, seed: 52, mu: 11, sigma: 2, shiftZ: (i) => (i >= 3 && i < 13 ? -1.3 : 0), weightAt: () => 0.5 }) };
    expect(firstNoticeDay(setup(pts), days(40))).toBeUndefined();
  });
  it("re-alert suppression within 14 days", () => {
    const pts = { recall: series({ n: 44, seed: 61, shiftZ: () => -2 }), fluency: series({ n: 44, seed: 62, mu: 11, sigma: 2, shiftZ: () => -2 }) };
    const asOf = days(44)[43]!;
    expect(evaluateAlerts({ ...setup(pts), asOf, lastAlertOpenedAt: addDays(asOf, -5) }).suppressed).toBe(true);
    expect(evaluateAlerts({ ...setup(pts), asOf, lastAlertOpenedAt: addDays(asOf, -20) }).suppressed).toBe(false);
  });
  it("recovery mode flips sign: an upward shift reads as improving", () => {
    const pts = { recall: series({ n: 44, seed: 71, shiftZ: () => 1.4 }), fluency: series({ n: 44, seed: 72, mu: 11, sigma: 2, shiftZ: () => 1.4 }) };
    expect(evaluateAlerts({ ...setup(pts), mode: "recovery", asOf: days(44)[43]! }).status).toBe("improving");
    expect(evaluateAlerts({ ...setup(pts), mode: "atRisk", asOf: days(44)[43]! }).status).toBe("ok");
  });
  it("no baseline yet", () => expect(evaluateAlerts({ mode: "atRisk", asOf: "2026-01-05", baseline: {}, daily: {} }).status).toBe("not_enough_data"));
});
