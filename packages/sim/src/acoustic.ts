/**
 * Tier B acoustic features, computed in the browser from the microphone. Raw audio is never stored or sent:
 * only six numbers per utterance leave this module. Experimental; labeled that way everywhere.
 */
export interface AcousticSummary { rmsDb: number; f0Median: number; f0Iqr: number; wordsPerSec: number; pauseRatio: number; syllRate: number; meanPauseMs: number }

export const F0_MIN = 75, F0_MAX = 400, HOP_MS = 50;
const r1 = (x: number) => Math.round(x * 10) / 10, r2 = (x: number) => Math.round(x * 100) / 100;

export function rms(frame: Float32Array): number {
  let s = 0; for (let i = 0; i < frame.length; i++) s += frame[i]! * frame[i]!;
  return Math.sqrt(s / frame.length);
}

/** Autocorrelation pitch estimate in Hz (0 when unvoiced). */
export function estimateF0(frame: Float32Array, sampleRate: number): number {
  const n = frame.length;
  let mean = 0; for (let i = 0; i < n; i++) mean += frame[i]!; mean /= n;
  const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = frame[i]! - mean;
  const minLag = Math.floor(sampleRate / F0_MAX), maxLag = Math.min(n - 2, Math.ceil(sampleRate / F0_MIN));
  let r0 = 0; for (let i = 0; i < n; i++) r0 += x[i]! * x[i]!;
  if (r0 < 1e-9) return 0;
  const r = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1 && lag < n; lag++) {
    let s = 0; for (let i = 0; i + lag < n; i++) s += x[i]! * x[i + lag]!;
    r[lag] = s / r0 * (n / (n - lag)); // unbiased normalization
  }
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (r[lag]! > best && r[lag]! >= r[lag - 1]! && r[lag]! >= r[lag + 1]!) { best = r[lag]!; bestLag = lag; }
  if (best < 0.3 || !bestLag) return 0;
  // prefer the shortest lag that is nearly as strong (avoids octave-down errors)
  for (let lag = minLag; lag < bestLag; lag++) if (r[lag]! >= 0.85 * best && r[lag]! >= r[lag - 1]! && r[lag]! >= r[lag + 1]!) { bestLag = lag; break; }
  const a = r[bestLag - 1]!, b = r[bestLag]!, c = r[bestLag + 1]!; // parabolic interpolation
  const denom = a - 2 * b + c;
  const shift = denom ? (0.5 * (a - c)) / denom : 0;
  return sampleRate / (bestLag + shift);
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
};

export class AcousticAnalyzer {
  private rmsFrames: number[] = [];
  private f0Frames: number[] = [];
  constructor(private hopMs = HOP_MS) {}
  push(frame: Float32Array, sampleRate: number) { const e = rms(frame); this.rmsFrames.push(e); this.f0Frames.push(e > 1e-4 ? estimateF0(frame, sampleRate) : 0); }
  get frames() { return this.rmsFrames.length; }
  reset() { this.rmsFrames = []; this.f0Frames = []; }

  private threshold(): number {
    const sorted = [...this.rmsFrames].sort((a, b) => a - b);
    return Math.max(1e-3, 0.2 * quantile(sorted, 0.9));
  }
  /** Live numbers for the meter (no word count yet). */
  snapshot() { const s = this.summary(0); return { f0Iqr: s.f0Iqr, pauseRatio: s.pauseRatio, rmsDb: s.rmsDb }; }

  summary(wordCount: number): AcousticSummary {
    const thr = this.threshold(), hop = this.hopMs / 1000;
    const speech = this.rmsFrames.map((e) => e > thr);
    const idx = speech.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return { rmsDb: -90, f0Median: 0, f0Iqr: 0, wordsPerSec: 0, pauseRatio: 0, syllRate: 0, meanPauseMs: 0 };
    const first = idx[0]!, last = idx[idx.length - 1]!;
    const voicedSec = idx.length * hop;
    // pauses: silent runs of >= 200 ms between first and last speech frame
    const pauses: number[] = []; let run = 0;
    for (let i = first; i <= last; i++) { if (!speech[i]) run++; else { if (run * this.hopMs >= 200) pauses.push(run * this.hopMs); run = 0; } }
    const pauseTotal = pauses.reduce((a, b) => a + b, 0);
    const span = (last - first + 1) * this.hopMs;
    const f0 = idx.map((i) => this.f0Frames[i]!).filter((f) => f > 0).sort((a, b) => a - b);
    const dbs = idx.map((i) => 20 * Math.log10(Math.max(this.rmsFrames[i]!, 1e-6)));
    // syllable proxy: peaks in the smoothed envelope
    const env = this.rmsFrames.map((_, i, a) => ((a[i - 1] ?? a[i]!) + a[i]! + (a[i + 1] ?? a[i]!)) / 3);
    let peaks = 0;
    for (let i = Math.max(first, 1); i < last; i++) if (env[i]! > thr * 1.5 && env[i]! >= env[i - 1]! && env[i]! > env[i + 1]!) peaks++;
    return {
      rmsDb: r1(dbs.reduce((a, b) => a + b, 0) / dbs.length),
      f0Median: Math.round(quantile(f0, 0.5)), f0Iqr: r1(quantile(f0, 0.75) - quantile(f0, 0.25)),
      wordsPerSec: r2(wordCount / voicedSec), pauseRatio: r2(pauseTotal / span), syllRate: r2(peaks / voicedSec), meanPauseMs: pauses.length ? Math.round(pauseTotal / pauses.length) : 0,
    };
  }
}

/** Opens the mic, feeds the analyzer every 50 ms, and returns a handle. Audio stays in memory only as short frames. */
export async function startAcousticCapture(onMeter?: (m: { f0Iqr: number; pauseRatio: number; rmsDb: number }) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize), an = new AcousticAnalyzer();
  const t = setInterval(() => { analyser.getFloatTimeDomainData(buf); an.push(buf, ctx.sampleRate); }, HOP_MS);
  const m = onMeter ? setInterval(() => onMeter(an.snapshot()), 250) : undefined;
  return { finish(wordCount: number): AcousticSummary { clearInterval(t); if (m) clearInterval(m); stream.getTracks().forEach((x) => x.stop()); void ctx.close(); return an.summary(wordCount); }, cancel() { clearInterval(t); if (m) clearInterval(m); stream.getTracks().forEach((x) => x.stop()); void ctx.close(); } };
}
