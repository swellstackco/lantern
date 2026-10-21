// One command: node video/build.mjs   (or: npm run video)
//   audio prep -> alignment -> timeline.json -> audio mix -> frame render (deterministic, 30 fps) -> mp4 -> checks.
// Flags: --timeline  (stop after timeline.json + audio mix)   --keep-frames  (reuse frames/ if present)   --limit=SECONDS (default 175)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { prepLine, align } from "./audio.mjs";
import { storyboard } from "./storyboard.mjs";
import { renderFrames } from "./render.mjs";

const HERE = new URL("./", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}`));
const LIMIT = parseFloat(flag("limit")?.split("=")[1] ?? "177.8");
mkdirSync(`${HERE}out`, { recursive: true });

if (!existsSync(`${HERE}shots/manifest.json`)) { console.error("No stills yet. Run: node video/capture.mjs"); process.exit(1); }
const lines = JSON.parse(readFileSync(`${HERE}lines.json`, "utf8"));
const manifest = JSON.parse(readFileSync(`${HERE}shots/manifest.json`, "utf8"));
const turns = JSON.parse(readFileSync(`${HERE}shots/turns.json`, "utf8"));
const clips = {}, al = {};
for (const l of lines) { clips[l.id] = prepLine(l); }
for (const l of lines.filter((x) => x.layer === "narrator")) al[l.id] = align(l.text, clips[l.id].file, clips[l.id].dur);
const placeholders = Object.values(clips).filter((c) => c.placeholder).map((c) => c.id);
console.log(`clips: ${lines.length} (${placeholders.length ? "placeholder voices: " + placeholders.join(",") : "no placeholders"}); alignment: ` + Object.entries(al).map(([k, v]) => `${k}:${v.mode}`).join(" "));

// the sim's real replies vs the spoken lines (spoken lines are allowed to be shorter; warn if the topic drifted)
const said = turns.map((t) => t.alexaSay);
for (const l of lines.filter((x) => x.layer === "alexa")) { const key = l.text.split(/[.!?]/)[0].replace(/[^a-z0-9 ]/gi, "").toLowerCase().slice(0, 18); if (!said.some((s) => s && s.replace(/[^a-z0-9 ]/gi, "").toLowerCase().includes(key))) console.warn(`note: ${l.id} opening ("${l.text.slice(0, 30)}") is not a prefix of any captured sim reply`); }

const shots = manifest;
const chart = JSON.parse(readFileSync(`${HERE}shots/chart-geometry.json`, "utf8"));
const inspector = JSON.parse(readFileSync(`${HERE}shots/inspector.json`, "utf8"));
const excerpt = JSON.parse(readFileSync(`${HERE}shots/export-excerpt.json`, "utf8"));
const skill = readFileSync(`${HERE}../skills/lantern-checkin/SKILL.md`, "utf8").split("\n").slice(0, 34);

const dropOrder = lines.filter((l) => l.layer === "alexa" && l.priority > 0).sort((a, b) => b.priority - a.priority).map((l) => l.id);
const drop = new Set(); let tl;
for (;;) {
  tl = storyboard({ clips, align: al, shots, chart, inspector, skill, excerpt, drop });
  if (tl.duration <= LIMIT || !dropOrder.length) break;
  const d = dropOrder.shift(); drop.add(d); console.log(`over ${LIMIT}s (${tl.duration.toFixed(1)}): Alexa line ${d} shown on screen but not voiced`);
}
tl.dropped = [...drop];
const audioList = tl.audio;
// ---- mix
const wav = `${HERE}audio/_work/track.wav`;
const inputs = audioList.flatMap((a) => ["-i", a.file]);
const fc = audioList.map((a, i) => `[${i}:a]adelay=${Math.round(a.start * 1000)}|${Math.round(a.start * 1000)}[a${i}]`).join(";") + ";" + audioList.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${audioList.length}:normalize=0:dropout_transition=0,alimiter=limit=0.92,apad=whole_dur=${tl.duration}[m]`;
writeFileSync(`${HERE}audio/_work/mix.txt`, fc);
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex_script", `${HERE}audio/_work/mix.txt`, "-map", "[m]", "-t", String(tl.duration), "-ar", "44100", "-ac", "2", wav], { stdio: "inherit" });
tl.shots = Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, { file: v.file, w: v.w, h: v.h, boxes: v.boxes }]));
writeFileSync(`${HERE}out/timeline.json`, JSON.stringify(tl, null, 1));
writeFileSync(`${HERE}timeline.json`, JSON.stringify(tl));
console.log(`timeline: ${tl.duration.toFixed(2)}s, ${audioList.length} audio events, ${tl.captions.length} captions`);
if (flag("timeline")) process.exit(0);

// ---- frames
const frames = `${HERE}frames`;
if (!(flag("keep-frames") && existsSync(frames))) { rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true }); await renderFrames({ dir: HERE, frames, duration: tl.duration, fps: tl.fps }); }
// ---- mux
const mp4 = `${HERE}out/lantern-demo.mp4`;
execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", String(tl.fps), "-i", `${frames}/f%05d.jpg`, "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-r", String(tl.fps), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", mp4], { stdio: "inherit" });
// ---- contact sheet (one frame / 5 s, labeled; built in Chrome because this ffmpeg has no drawtext)
mkdirSync(`${HERE}out/cs`, { recursive: true }); const cells = [];
for (let s = 2; s < tl.duration; s += 5) {
  const f = `${HERE}out/cs/${String(Math.round(s)).padStart(4, "0")}.png`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(s), "-i", mp4, "-frames:v", "1", "-vf", "scale=640:360", f]);
  cells.push(`<figure><img src="file://${f}"><figcaption>${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}</figcaption></figure>`);
}
{ const { chromium } = await import("playwright-core"); const { chromePath } = await import("./render.mjs");
  const sheet = `${HERE}out/cs/sheet.html`;
  writeFileSync(sheet, `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(5,640px);gap:6px;padding:6px;width:3236px;font:700 24px Helvetica"><style>figure{margin:0;position:relative}figcaption{position:absolute;left:0;top:0;background:#000b;color:#fff;padding:4px 10px}img{display:block}</style>${cells.join("")}</body>`);
  const br = await chromium.launch({ executablePath: chromePath() }); const pg = await br.newPage({ viewport: { width: 3236, height: 800 } });
  await pg.goto("file://" + sheet); await pg.waitForTimeout(800); await pg.screenshot({ path: `${HERE}out/contact-sheet.png`, fullPage: true }); await br.close(); }
rmSync(`${HERE}out/cs`, { recursive: true, force: true });
// ---- checks
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,width,height", "-of", "json", mp4], { encoding: "utf8" }));
const bd = spawnSync("ffmpeg", ["-i", mp4, "-vf", "blackdetect=d=0.5:pic_th=0.98", "-an", "-f", "null", "-"], { encoding: "utf8" }).stderr.split("\n").filter((l) => /black_start/.test(l));
console.log(JSON.stringify({ duration: +probe.format.duration, streams: probe.streams, blackFrames: bd }, null, 1));
