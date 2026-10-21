import { describe, expect, it } from "vitest";
import { AcousticAnalyzer, estimateF0, rms } from "./acoustic.js";

const SR = 44100;
function tone(freq: number, n = 2048, amp = 0.3, phase0 = 0): Float32Array { const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = amp * Math.sin(2 * Math.PI * freq * (i / SR) + phase0); return f; }
/** voice-like: fundamental plus harmonics */
function voice(freq: number, n = 2048, amp = 0.3): Float32Array { const f = new Float32Array(n); for (let h = 1; h <= 5; h++) for (let i = 0; i < n; i++) f[i]! += (amp / h) * Math.sin(2 * Math.PI * freq * h * (i / SR)); return f; }

describe("estimateF0", () => {
  it("sine sweep 90-380 Hz stays within 5%", () => {
    for (let f = 90; f <= 380; f += 10) { const est = estimateF0(tone(f), SR); expect(Math.abs(est - f) / f, `${f} Hz -> ${est}`).toBeLessThan(0.05); }
  });
  it("harmonic voice-like signal at 120 and 220 Hz stays within 5% (no octave errors)", () => {
    for (const f of [120, 220]) expect(Math.abs(estimateF0(voice(f), SR) - f) / f).toBeLessThan(0.05);
  });
  it("silence and noise-free zero frame returns 0", () => { expect(estimateF0(new Float32Array(2048), SR)).toBe(0); });
  it("random noise is mostly unvoiced", () => {
    let seed = 1; const f = new Float32Array(2048).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.2);
    expect(estimateF0(f, SR)).toBe(0);
  });
});

describe("AcousticAnalyzer", () => {
  it("computes rms", () => { expect(rms(tone(200, 2048, 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 2); });
  it("reports pitch range, pause ratio and speaking rate for synthetic speech", () => {
    const a = new AcousticAnalyzer();
    // 1 s speaking with pitch gliding 150 -> 210 Hz, 0.5 s pause, 1 s speaking at 180 Hz (frames at 50 ms hop)
    for (let i = 0; i < 20; i++) a.push(voice(150 + 3 * i), SR);
    for (let i = 0; i < 10; i++) a.push(new Float32Array(2048).map(() => 0.0001), SR);
    for (let i = 0; i < 20; i++) a.push(voice(210 - 3 * i), SR);
    const s = a.summary(5);
    expect(s.f0Median).toBeGreaterThan(160); expect(s.f0Median).toBeLessThan(200);
    expect(s.f0Iqr).toBeGreaterThan(10); expect(s.f0Iqr).toBeLessThan(40);
    expect(s.pauseRatio).toBeGreaterThan(0.15); expect(s.pauseRatio).toBeLessThan(0.3);
    expect(s.meanPauseMs).toBeGreaterThanOrEqual(450);
    expect(s.wordsPerSec).toBeCloseTo(5 / 2, 1);
    expect(s.rmsDb).toBeLessThan(0);
  });
  it("narrower pitch glide gives a smaller IQR", () => {
    const wide = new AcousticAnalyzer(), narrow = new AcousticAnalyzer();
    for (let i = 0; i < 30; i++) { wide.push(voice(130 + 4 * i), SR); narrow.push(voice(175 + 0.5 * i), SR); }
    expect(narrow.summary(3).f0Iqr).toBeLessThan(wide.summary(3).f0Iqr);
  });
  it("silence gives zeros", () => { const a = new AcousticAnalyzer(); for (let i = 0; i < 10; i++) a.push(new Float32Array(2048), SR); expect(a.summary(0).wordsPerSec).toBe(0); });
});
