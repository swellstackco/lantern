/** Browser built-in speech: speechSynthesis for the Alexa voice, webkitSpeechRecognition for the mic. */
let enabled = true;
export const speech = {
  setEnabled(v: boolean) { enabled = v; if (!v) window.speechSynthesis?.cancel(); },
  speak(text: string) {
    if (!enabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en-US/i.test(v.lang) && /samantha|ava|allison|female|google us english/i.test(v.name)) ?? voices.find((v) => /en-US/i.test(v.lang)) ?? null;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  },
  stop() { window.speechSynthesis?.cancel(); },
};
export const micSupported = () => "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
import { startAcousticCapture, type AcousticSummary } from "./acoustic";
export type Acoustic = Pick<AcousticSummary, "rmsDb" | "f0Median" | "f0Iqr" | "wordsPerSec" | "pauseRatio" | "syllRate">;
export async function listen(onFinal: (text: string, timings: { startMs: number; endMs: number }, acoustic?: Acoustic) => void, onState: (listening: boolean) => void, onMeter?: (m: { f0Iqr: number; pauseRatio: number; rmsDb: number }) => void) {
  let cap: Awaited<ReturnType<typeof startAcousticCapture>> | undefined;
  try { cap = await startAcousticCapture(onMeter); } catch { cap = undefined; } // no mic permission: text only
  const Rec = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
  const rec = new Rec(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
  const start = performance.now();
  rec.onstart = () => onState(true); rec.onend = () => { onState(false); cap?.cancel(); }; rec.onerror = () => { onState(false); cap?.cancel(); };
  rec.onresult = (e: any) => {
    const text: string = e.results[0][0].transcript;
    const a = cap?.finish(text.trim().split(/\s+/).length);
    const acoustic = a ? { rmsDb: a.rmsDb, f0Median: a.f0Median, f0Iqr: a.f0Iqr, wordsPerSec: a.wordsPerSec, pauseRatio: a.pauseRatio, syllRate: a.syllRate } : undefined;
    onFinal(text, { startMs: 0, endMs: Math.round(performance.now() - start) }, acoustic);
  };
  rec.start();
  return () => rec.stop();
}
