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
export function listen(onFinal: (text: string, timings: { startMs: number; endMs: number }) => void, onState: (listening: boolean) => void) {
  const Rec = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
  const rec = new Rec(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
  const start = performance.now();
  rec.onstart = () => onState(true); rec.onend = () => onState(false); rec.onerror = () => onState(false);
  rec.onresult = (e: any) => { const text = e.results[0][0].transcript; onFinal(text, { startMs: 0, endMs: Math.round(performance.now() - start) }); };
  rec.start();
  return () => rec.stop();
}
