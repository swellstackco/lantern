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
  const stamp = `v3:${src.file}:${statSync(src.file).mtimeMs}`;
  const stampFile = `${WORK}${line.id}.stamp`;
  if (!existsSync(out) || !existsSync(stampFile) || readFileSync(stampFile, "utf8") !== stamp) {
    const tmp = `${WORK}${line.id}.raw.wav`;
    const trim = "silenceremove=start_periods=1:start_threshold=-46dB,areverse,silenceremove=start_periods=1:start_threshold=-46dB,areverse";
    ff(["-i", src.file, "-ac", "1", "-ar", "44100", "-af", trim, tmp]);
    const vd = spawnSync("ffmpeg", ["-i", tmp, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const mean = parseFloat(/mean_volume: (-?[\d.]+) dB/.exec(vd)?.[1] ?? "-21");
    const gain = Math.max(-12, Math.min(14, -21 - mean));
    // Rose only: a light "in the kitchen" treatment so she reads as a person in a room next to the clean studio narrator
    const room = line.layer === "rose" ? ",highpass=f=180,lowpass=f=6500,aecho=0.85:0.5:38|71:0.16|0.09,volume=-1dB" : "";
    ff(["-i", tmp, "-af", `volume=${gain.toFixed(2)}dB${room},alimiter=limit=0.89,apad=pad_dur=0.04`, "-ar", "44100", "-ac", "1", out]);
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
// word timestamps from local whisper.cpp (free, offline); cached next to the clip
const WHISPER_MODEL = `${process.env.HOME}/.cache/whisper/ggml-medium.en.bin`;
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
function whisperWords(file) {
  const cache = `${file}.words.json`;
  if (existsSync(cache) && statSync(cache).mtimeMs >= statSync(file).mtimeMs) return JSON.parse(readFileSync(cache, "utf8"));
  if (!existsSync(WHISPER_MODEL)) return null;
  const wav16 = `${file}.16k.wav`;
  ff(["-i", file, "-ar", "16000", "-ac", "1", wav16]);
  const o = spawnSync("whisper-cli", ["-m", WHISPER_MODEL, "-f", wav16, "-ml", "1", "-sow"], { encoding: "utf8" });
  if (o.status !== 0) return null;
  const ts = (x) => { const [h, m, sec] = x.split(":"); return +h * 3600 + +m * 60 + +sec; };
  const words = [...o.stdout.matchAll(/\[(\S+) --> (\S+)\]\s+(\S.*)/g)].map((m) => ({ s: ts(m[1]), e: ts(m[2]), w: m[3].trim() })).filter((x) => norm(x.w));
  writeFileSync(cache, JSON.stringify(words));
  return words;
}
/** phrase boundaries from whisper word timings: the end of each phrase = the word matching its last token, snapped to the nearest real pause */
function alignWhisper(ph, file, total) {
  const words = whisperWords(file); if (!words || !words.length) return null;
  const pauses = silences(file, -40, 0.05);
  const bounds = [0]; let k = 0;
  for (let i = 0; i < ph.length - 1; i++) {
    const toks = ph[i].split(/\s+/).map(norm).filter(Boolean); const last = toks[toks.length - 1];
    let j = -1; for (let q = k; q < words.length; q++) { const w = norm(words[q].w); if (w === last || w.endsWith(last) || (last.length > 3 && last.endsWith(w) && w.length > 2)) { j = q; break; } }
    if (j < 0 || j + 1 >= words.length) return null;
    let b = (words[j].e + words[j + 1].s) / 2;
    let best = null, bd = 0.25; for (const p of pauses) { const m = (p.s + p.e) / 2; if (Math.abs(m - b) < bd) { bd = Math.abs(m - b); best = m; } }
    if (best !== null) b = best;
    bounds.push(b); k = j + 1;
  }
  bounds.push(total);
  for (let i = 1; i < bounds.length; i++) if (bounds[i] <= bounds[i - 1]) return null;
  return { mode: "whisper", phrases: ph.map((t, i) => ({ text: t, start: bounds[i], end: bounds[i + 1], mid: i < ph.length - 1 ? bounds[i + 1] : null })) };
}
/** phrases with start/end times (seconds into the clip); whisper word timings first, else the pauses at punctuation. */
export function align(text, file, total) {
  const ph = phrasesOf(text); const need = ph.length - 1;
  if (need > 0) { const w = alignWhisper(ph, file, total); if (w) return w; console.warn(`align: whisper failed for ${file}, falling back to pauses`); }
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
    const cand = silences(file, -38, 0.1).filter((x) => x.e < total - 0.05); const used = new Set();
    const bounds = [0]; // proportional boundary guesses, snapped to the nearest real pause so cuts never land inside a word
    for (let i = 0; i < need; i++) { acc += chars[i]; const g = (acc / sum) * total; let best = -1, bd = 0.7;
      cand.forEach((c, k) => { const d = Math.abs((c.s + c.e) / 2 - g); if (!used.has(k) && d < bd) { bd = d; best = k; } });
      if (best >= 0) { used.add(best); bounds.push(((cand[best].s + cand[best].e) / 2)); } else bounds.push(g); }
    bounds.push(total);
    return { mode: "proportional-snapped", phrases: ph.map((t, i) => ({ text: t, start: bounds[i], end: bounds[i + 1], mid: i < need ? bounds[i + 1] : null })) };
  }
  return { mode, phrases: ph.map((t, i) => ({ text: t, start: i === 0 ? 0 : cuts[i - 1].e - 0.03, end: i === need ? total : cuts[i].s + 0.03, mid: i < need ? (cuts[i].s + cuts[i].e) / 2 : null })) };
}
/** cut phrases [i0..i1] of a prepared clip into its own file (with tiny fades) */
export function piece(clip, al, i0, i1) {
  const a = i0 === 0 ? 0 : al.phrases[i0 - 1].mid ?? al.phrases[i0].start;
  const b = i1 === al.phrases.length - 1 ? clip.dur : al.phrases[i1].mid ?? al.phrases[i1].end;
  const out = `${WORK}${clip.id}_${i0}-${i1}.wav`;
  // trim inside the filter and reset timestamps, so the fade-out is timed from the piece's own start (output -ss left it on the source clock and silenced the tail)
  ff(["-i", clip.file, "-af", `atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, b - a - 0.03).toFixed(3)}:d=0.03`, out]);
  const d = dur(out);
  const phrases = al.phrases.slice(i0, i1 + 1).map((p) => ({ text: p.text, start: Math.max(0, p.start - a), end: Math.min(d, p.end - a) }));
  return { id: `${clip.id}[${i0}-${i1}]`, layer: clip.layer, file: out, dur: d, phrases, text: phrases.map((p) => p.text).join(" ") };
}

/** keep every phrase except those matching `drop`; the kept runs are cut out of the clip and joined (tiny gap) into one new clip */
export function splice(clip, al, drop, tag) {
  const keep = al.phrases.map((p) => !drop.test(p.text));
  const runs = []; let s = -1;
  keep.forEach((k, i) => { if (k && s < 0) s = i; if ((!k || i === keep.length - 1) && s >= 0) { runs.push([s, k ? i : i - 1]); s = -1; } });
  if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === keep.length - 1) return { clip, al };
  const parts = runs.map(([a, b]) => piece(clip, al, a, b));
  const out = `${WORK}${clip.id}_${tag}.wav`;
  const gap = 0.12;
  const fc = parts.map((_, i) => `[${i}:a]apad=pad_dur=${gap}[p${i}]`).join(";") + ";" + parts.map((_, i) => `[p${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[o]`;
  ff([...parts.flatMap((p) => ["-i", p.file]), "-filter_complex", fc, "-map", "[o]", out]);
  const d = dur(out); let off = 0; const phrases = [];
  for (const p of parts) { for (const ph of p.phrases) phrases.push({ ...ph, start: ph.start + off, end: ph.end + off }); off += p.dur + gap; }
  return { clip: { ...clip, file: out, dur: d, id: clip.id }, al: { mode: "spliced", phrases } };
}
