// Post-render checks from timeline.json: dialog vs narrator overlap, bubble-state switch vs audio start, cut-point energy.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const tl = JSON.parse(readFileSync(new URL("./timeline.json", import.meta.url)));
const fps = tl.fps, A = tl.audio.filter((a) => a.layer !== "sfx");
const dlg = A.filter((a) => a.layer === "alexa" || a.layer === "rose"), nar = A.filter((a) => a.layer === "narrator");
console.log(`duration ${tl.duration.toFixed(2)}s; cuts: ${JSON.stringify(tl.cuts)}; dialog lines voiced: ${dlg.length}`);
console.log("\nDIALOG vs NARRATOR overlap + state switch (frames)");
console.log("line  start   end    overlapNarr  nearestState        dFrames");
let bad = 0;
for (const d of dlg) {
  const ov = nar.filter((n) => n.start < d.start + d.dur && d.start < n.start + n.dur).map((n) => n.id);
  const st = tl.states.reduce((b, s) => (Math.abs(s.t - d.start) < Math.abs(b.t - d.start) ? s : b));
  const df = Math.round((st.t - d.start) * fps);
  if (ov.length || Math.abs(df) > 2) bad++;
  console.log(`${d.id.padEnd(5)} ${d.start.toFixed(2).padStart(6)} ${(d.start + d.dur).toFixed(2).padStart(6)}  ${(ov.join(",") || "none").padEnd(11)}  ${st.img.padEnd(18)} ${df}`);
}
console.log(bad ? `${bad} problem(s)` : "all dialog clear of narration; all state switches within 2 frames");
console.log("\nCUT POINTS (RMS dBFS in 50 ms before / after the join; a cut inside a word shows loud on both sides)");
const rms = (f, a, b) => { const o = execFileSync("ffmpeg", ["-v", "info", "-ss", String(Math.max(0, a)), "-t", String(b - a), "-i", f, "-af", "astats=metadata=0", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return o; };
const lv = (f, a, b) => { const r = execFileSync("sh", ["-c", `ffmpeg -v info -ss ${Math.max(0, a)} -t ${(b - a).toFixed(3)} -i "${f}" -af astats -f null - 2>&1 | grep -m1 "RMS level dB" | awk '{print $NF}'`], { encoding: "utf8" }).trim(); return r || "-inf"; };
for (const a of tl.audio.filter((x) => /\[|_cut/.test(x.id) || x.file.includes("_cut"))) {
  const f = a.file; const pts = []; // internal joins: phrase boundaries where text isn't contiguous are unknown; check start/end of each piece and every phrase start
  pts.push(["start", 0.0], ["end", a.dur]);
  console.log(`${a.id.padEnd(10)} ${f.split("/").pop().padEnd(18)} head(0-50ms) ${lv(f, 0, 0.05).padStart(7)}  tail(last 50ms) ${lv(f, a.dur - 0.05, a.dur).padStart(7)}`);
}
