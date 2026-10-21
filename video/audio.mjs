// Audio stage: find per-line clips (audio/<layer>/<id>.wav|mp3|m4a|aiff), create macOS `say` placeholders for
// anything missing (alexa always; narrator/rose only as stand-ins), trim + level every clip into audio/_work/,
// measure durations, and align phrases to the silences in the clip (punctuation pauses) for captions + callouts.
// No cloud TTS is ever called from here.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";

export const AUD = new URL("./audio/", import.meta.url).pathname;
const WORK = AUD + "_work/";
mkdirSync(WORK, { recursive: true });
const EXT = ["wav", "mp3", "m4a", "aiff", "flac"];
const VOICES = { narrator: ["Daniel", 170], rose: ["Grandma (English (US))", 150], alexa: ["Samantha", 195] };
const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "pipe" });
const dur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

export function sourceFor(line) {
  for (const e of EXT) { const f = `${AUD}${line.layer}/${line.id}.${e}`; if (existsSync(f)) return { file: f, ext: e };
  }
  return null;
}

function makeSay(line) {
  mkdirSync(`${AUD}${line.layer}`, { recursive: true });
  const [voice, rate] = VOICES[line.layer];
  const aiff = `${AUD}${line.layer}/${line.id}.aiff`;
  execFileSync("say", ["-v", voice, "-r", String(rate), "-o", aiff, line.text]);
  writeFileSync(`${AUD}${line.layer}/${line.id}.say.txt`, line.text);
  return aiff;
}

export function prepLine(line) {
  let src = sourceFor(line); let placeholder = false;
  const side = `${AUD}${line.layer}/${line.id}.say.txt`;
  if (line.layer === "alexa") {
    // Alexa is always the local macOS voice; regenerate when the text changed or the clip is missing.
    if (!src || (existsSync(side) && readFileSync(side, "utf8") !== line.text)) src = { file: makeSay(line), ext: "aiff" };
    placeholder = false;
  } else if (!src) { src = { file: makeSay(line), ext: "aiff" }; placeholder = true; }
  else if (existsSync(side)) placeholder = src.ext === "aiff";
  const out = `${WORK}${line.id}.wav`;
  const stamp = `${src.file}:${statSync(src.file).mtimeMs}`;
  const stampFile = `${WORK}${line.id}.stamp`;
  if (!existsSync(out) || !existsSync(stampFile) || readFileSync(stampFile, "utf8") !== stamp) {
    const tmp = `${WORK}${line.id}.raw.wav`;
    const trim = "silenceremove=start_periods=1:start_threshold=-46dB,areverse,silenceremove=start_periods=1:start_threshold=-46dB,areverse";
    ff(["-i", src.file, "-ac", "1", "-ar", "44100", "-af", trim, tmp]);
    const vd = spawnSync("ffmpeg", ["-i", tmp, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const mean = parseFloat(/mean_volume: (-?[\d.]+) dB/.exec(vd)?.[1] ?? "-21");
    const gain = Math.max(-12, Math.min(14, -21 - mean));
    ff(["-i", tmp, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89,apad=pad_dur=0.04`, "-ar", "44100", "-ac", "1", out]);
    writeFileSync(stampFile, stamp);
  }
  return { ...line, file: out, dur: dur(out), placeholder };
}

export function chime() {
  const f = `${WORK}chime.wav`;
  if (!existsSync(f)) ff(["-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*880*t)*exp(-5*t)+0.32*sin(2*PI*1318.5*t)*exp(-7*t):d=0.9:s=44100", "-af", "volume=-13dB", f]);
  return { file: f, dur: 0.9 };
}

const BREAK = /(?<=[.!?:;,|]['"”’)]?)\s+/;
export function phrasesOf(text) {
  return text.replace(/\s[—–]\s/g, " —| ").split(BREAK).map((s) => s.replace(/\|/g, "").trim()).filter(Boolean);
}
function silences(file, n, d) {
  const o = spawnSync("ffmpeg", ["-i", file, "-af", `silencedetect=n=${n}dB:d=${d}`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const s = [...o.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const e = [...o.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  return s.map((a, i) => ({ s: a, e: e[i] ?? a + d })).filter((x) => x.s > 0.08);
}
/** phrases with start/end times (seconds into the clip); uses the pauses at punctuation when they line up. */
export function align(text, file, total) {
  const ph = phrasesOf(text); const need = ph.length - 1;
  let cuts = null, mode = "proportional";
  if (need === 0) return { phrases: [{ text: ph[0], start: 0, end: total }], mode: "single" };
  const tries = [[-35, .12], [-32, .14], [-38, .10], [-30, .16], [-40, .09], [-28, .18], [-33, .2], [-36, .15], [-42, .08]];
  let best = null;
  for (const [n, d] of tries) {
    const sl = silences(file, n, d).filter((x) => x.e < total - 0.05);
    if (sl.length === need) { cuts = sl; mode = "silence"; break; }
    if (sl.length > need && (!best || sl.length < best.length)) best = sl;
  }
  if (!cuts && best) { cuts = [...best].sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, need).sort((a, b) => a.s - b.s); mode = "silence-longest"; }
  if (!cuts) {
    const chars = ph.map((p) => p.length); const sum = chars.reduce((a, b) => a + b, 0); let acc = 0;
    return { mode, phrases: ph.map((t, i) => { const s = (acc / sum) * total; acc += chars[i]; return { text: t, start: s, end: (acc / sum) * total }; }) };
  }
  return { mode, phrases: ph.map((t, i) => ({ text: t, start: i === 0 ? 0 : cuts[i - 1].e - 0.03, end: i === need ? total : cuts[i].s + 0.03, mid: i < need ? (cuts[i].s + cuts[i].e) / 2 : null })) };
}
/** cut phrases [i0..i1] of a prepared clip into its own file (with tiny fades) */
export function piece(clip, al, i0, i1) {
  const a = i0 === 0 ? 0 : al.phrases[i0 - 1].mid ?? al.phrases[i0].start;
  const b = i1 === al.phrases.length - 1 ? clip.dur : al.phrases[i1].mid ?? al.phrases[i1].end;
  const out = `${WORK}${clip.id}_${i0}-${i1}.wav`;
  ff(["-i", clip.file, "-ss", a.toFixed(3), "-to", b.toFixed(3), "-af", `afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, b - a - 0.03).toFixed(3)}:d=0.03`, out]);
  const d = dur(out);
  const phrases = al.phrases.slice(i0, i1 + 1).map((p) => ({ text: p.text, start: Math.max(0, p.start - a), end: Math.min(d, p.end - a) }));
  return { id: `${clip.id}[${i0}-${i1}]`, layer: clip.layer, file: out, dur: d, phrases, text: phrases.map((p) => p.text).join(" ") };
}
