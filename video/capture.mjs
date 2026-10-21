// Stage 1 — CAPTURE. Starts the real demo (seed + MCP server + simulator, clock pinned to a Tuesday morning),
// drives the real simulator through the whole VIDEO-SCRIPT path (text input, muted, headless) and saves
// high-resolution stills + element boxes for every beat. Nothing here is faked: every card, bubble and
// JSON-RPC message is produced by the running server.   Usage: node video/capture.mjs
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = `${HERE}/shots`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DAY = "2026-10-20";                       // a Tuesday, so Rose's "Tuesday." is right
const NOW = "2026-10-20T15:12:00Z";             // 08:12 in Rose's time zone (America/Phoenix)
const DPR = 3;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

const busy = (port) => new Promise((r) => { const s = createConnection(port, "127.0.0.1"); s.on("connect", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); });
if (await busy(8787) || await busy(5173)) { console.error("Ports 8787/5173 are in use. Stop `npm run dev` first; the capture runs its own pinned-clock copy."); process.exit(1); }

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "pipe" });
run("npx", ["tsx", "scripts/seed.ts", "--demo"], { LANTERN_TODAY: DAY });
run("npm", ["run", "build", "-w", "@lantern/views"]);
const procs = [
  spawn("npm", ["run", "start", "-w", "@lantern/server"], { cwd: ROOT, env: { ...process.env, LANTERN_NOW: NOW, LANTERN_SHOW_WORDS: "1" }, stdio: "ignore", detached: true }),
  spawn("npm", ["run", "dev", "-w", "@lantern/sim"], { cwd: ROOT, stdio: "ignore", detached: true }),
];
const cleanup = () => { for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} } };
process.on("exit", cleanup);
for (let i = 0; i < 80; i++) { if (await busy(8787) && await busy(5173)) break; await new Promise((r) => setTimeout(r, 500)); }
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ executablePath: CHROME, args: ["--mute-audio"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR, timezoneId: "America/Phoenix", locale: "en-US" });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(NOW));
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e));

const manifest = {}; const turns = [];
let brainLog = [];
page.on("response", async (r) => { if (r.url().includes("/api/brain")) { try { const b = await r.json(); if (b.say) brainLog.push({ say: b.say, display: b.display ?? b.say }); } catch {} } });

await page.goto("http://localhost:5173");
await page.getByText("MCP connected").waitFor({ timeout: 20000 });
await page.getByLabel("Alexa voice").uncheck();
await page.addStyleTag({ content: "body{background:transparent!important}*{caret-color:transparent!important}" });
await page.waitForTimeout(600);

const box = async (loc) => { try { const b = await loc.boundingBox({ timeout: 1500 }); return b; } catch { return null; } };
const dev = () => page.locator(".device");
const rel = (b, o) => b && { x: +(b.x - o.x).toFixed(1), y: +(b.y - o.y).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
const frame = () => page.frameLocator("iframe").first();

async function shotDevice(name, extra = {}) {
  const o = await box(dev());
  await dev().screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, animations: "disabled" });
  const dots = await page.evaluate(() => { const w = document.createTreeWalker(document.querySelector(".ribbon"), NodeFilter.SHOW_TEXT); let n, a = null, z = null; while ((n = w.nextNode())) { let i = n.nodeValue.indexOf("apple"); if (i >= 0 && n.nodeValue.includes("river")) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, n.nodeValue.lastIndexOf("river") + 5); const rects = [...r.getClientRects()]; const b = r.getBoundingClientRect(); a = { x: b.x, y: b.y, width: b.width, height: b.height }; } } return a; });
  const bubbles = await page.locator(".bubble").count();
  const boxes = { dots: rel(dots, o), lastBubble: bubbles ? rel(await box(page.locator(".bubble").last()), o) : null, ribbon: rel(await box(page.locator(".ribbon")), o), main: rel(await box(page.locator(".main")), o), screen: rel(await box(page.locator(".screen")), o), ...extra };
  manifest[name] = { file: `${name}.png`, w: 1280, h: 800, boxes };
  return o;
}
const settle = async () => {
  await page.waitForFunction(() => !document.querySelector(".bar.on"));
  await page.waitForTimeout(900);
  // cards are delivered by postMessage a moment after load: wait until the card actually has content
  if (await page.locator("iframe").count()) {
    for (let i = 0; i < 50; i++) { const txt = await frame().locator("body").innerText({ timeout: 1000 }).catch(() => ""); if (txt.trim().length > 8) break; await page.waitForTimeout(150); }
    await page.waitForTimeout(300);
  }
};

let gateOpen = true, gateRelease = () => {}, gate = Promise.resolve();
await page.route("**/api/brain", async (route) => { if (!gateOpen) await gate; await route.continue(); });

async function turn(id, text, opts = {}) {
  brainLog = [];
  gateOpen = false; gate = new Promise((r) => (gateRelease = r));
  await page.getByLabel("What Rose says").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(350);
  await shotDevice(`${id}-pre`);
  gateOpen = true; gateRelease();
  await settle();
  const extra = opts.boxes ? await opts.boxes() : {};
  const o = await shotDevice(`${id}-post`, extra);
  const last = brainLog.at(-1);
  turns.push({ id, rose: text, alexaSay: last?.say ?? null, alexaDisplay: last?.display ?? null, pre: `${id}-pre`, post: `${id}-post` });
  return o;
}

await shotDevice("ambient");

// ---- 0:20 morning + midday check-ins
await turn("m1", "Alexa, good morning");
await turn("m2", "About five hours.");
await turn("m3", "Tuesday.");
await turn("m4", "ok");
await turn("d1", "Alexa, good afternoon");
await turn("d2", "Apple… river.");
await turn("d3", "Dog, cat, horse, cow, lion, rabbit, bird, fish.");
await turn("d4", "She won second place.");

// ---- 0:50 developer drawer (widened for the camera)
async function sideStyle(on) {
  await page.evaluate((on) => {
    document.getElementById("vstyle")?.remove();
    if (!on) return;
    const s = document.createElement("style"); s.id = "vstyle";
    s.textContent = ".stage{display:block!important;padding:0!important}.device-wrap{display:none!important}.side{position:relative!important;top:0!important;width:1000px!important;height:820px!important;max-height:none!important}.entry pre{max-height:none!important}.entry{font-size:15px!important}.preview{height:620px!important}";
    document.head.appendChild(s);
  }, on);
  await page.waitForTimeout(250);
}
async function shotSide(name, rings = []) {
  const o = await box(page.locator(".side"));
  await page.locator(".side").screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, animations: "disabled" });
  manifest[name] = { file: `${name}.png`, w: Math.round(o.width), h: Math.round(o.height), boxes: Object.fromEntries(rings.filter((r) => r.box).map((r) => [r.name, rel(r.box, o)])) };
}
await page.getByRole("tab", { name: "JSON-RPC" }).click();
await sideStyle(true);
const entries = page.locator(".entry");
const summaryTexts = await page.locator(".entry summary").allInnerTexts();
const idx = (re, from = 0) => summaryTexts.findIndex((t, i) => i >= from && re.test(t.replace(/\s+/g, " ")));
const textBox = (needle) => page.evaluate((needle) => {
  const w = document.createTreeWalker(document.querySelector(".side"), NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const i = n.nodeValue.indexOf(needle); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + needle.length); const b = r.getBoundingClientRect(); if (b.width) return { x: b.x, y: b.y, width: b.width, height: b.height }; } }
  return null;
}, needle);
async function openEntry(i, needles) {
  const e = entries.nth(i);
  await e.locator("summary").click();
  await e.scrollIntoViewIfNeeded();
  await page.evaluate((i) => document.querySelectorAll(".entry")[i].scrollIntoView({ block: "start" }), i);
  await page.waitForTimeout(300);
  const rings = [{ name: "summary", box: await box(e.locator("summary")) }];
  for (const n of needles) rings.push({ name: n, box: await textBox(n) });
  return { rings, close: () => e.locator("summary").click() };
}
// list view: everything collapsed
await page.evaluate(() => document.querySelector(".side .scroll").scrollTo(0, 0));
await shotSide("drawer-list", [{ name: "first", box: await box(entries.nth(0).locator("summary")) }]);
let o = await openEntry(idx(/initialize/), ["protocolVersion", "2025-11-25"]);
await shotSide("drawer-initialize", o.rings); await o.close();
o = await openEntry(idx(/result \(tools\/list\)/), ["start_checkin", "record_answer"]);
await shotSide("drawer-toolslist", o.rings); await o.close();
o = await openEntry(idx(/tools\/call start_checkin/), ["start_checkin"]);
await shotSide("drawer-startcheckin", o.rings); await o.close();
o = await openEntry(idx(/result \(tools\/call record_answer/), []);
await shotSide("drawer-recordanswer", o.rings); await o.close();
await sideStyle(false);
await page.getByRole("tab", { name: "Talk" }).click();
await page.waitForTimeout(300);

// ---- 1:00 trend card for Maya (zoom targets measured in the real chart)
const chartBoxes = async () => {
  const f = frame(); const o = await box(dev());
  const b = async (sel, n = 0) => rel(await box(f.locator(sel).nth(n)), o);
  return { chart: await b("svg"), ring: await b('circle[r="5"]'), flag: await b('line[stroke-width="2.5"]'), window: await b('rect[opacity=".16"]'), polyline: await b('polyline[stroke-width="3.5"]'), band: await b('rect[opacity=".75"]'), card: await b("body > *") };
};
await turn("t1", "Alexa, show Maya how Mom's doing", { boxes: chartBoxes });
writeFileSync(`${OUT}/chart-geometry.json`, JSON.stringify(manifest["t1-post"].boxes, null, 1));
// 1:30 visit + outbox
await turn("t2", "Friday ten.");
await page.getByRole("tab", { name: "Outbox" }).click();
await sideStyle(true);
await page.waitForTimeout(1200);
const items = page.locator(".outbox-item");
const nItems = await items.count();
const subjects = await items.allInnerTexts();
writeFileSync(`${OUT}/outbox-subjects.json`, JSON.stringify(subjects, null, 1));
for (let i = 0; i < Math.min(nItems, 4); i++) {
  await items.nth(i).click(); await page.waitForTimeout(500);
  await shotSide(`outbox-${i}`, [{ name: "item", box: await box(items.nth(i)) }]);
}
await sideStyle(false);
await page.getByRole("tab", { name: "Talk" }).click();

// ---- full-height captures of the fullscreen cards (so the camera can scroll them smoothly)
async function tallShot(name) {
  const f = page.frames().find((fr) => fr !== page.mainFrame());
  const h = await f.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate((h) => { const s = document.createElement("style"); s.id = "tall"; s.textContent = `.device{height:${h + 76}px!important}.fs button{display:none!important}`; document.head.appendChild(s); }, h);
  await page.waitForTimeout(700);
  const el = page.locator(".fs iframe"); const b = await box(el);
  await el.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, animations: "disabled" });
  manifest[name] = { file: `${name}.png`, w: Math.round(b.width), h: Math.round(b.height), boxes: {} };
  await page.evaluate(() => document.getElementById("tall")?.remove());
  await page.waitForTimeout(400);
}
await turn("ds", "Show the doctor summary");
await tallShot("doctor-tall");
await page.getByRole("button", { name: "Close" }).click(); await page.waitForTimeout(500);
const cardText = () => frame().locator("body").innerText({ timeout: 1500 }).catch(() => "");
await turn("vt", "show the voice trend");
for (let k = 0; k < 4 && (await cardText()).trim().length < 20; k++) {   // the card occasionally arrives blank: ask again
  await page.getByRole("button", { name: "Clear card" }).click(); await page.waitForTimeout(300);
  await turn(`vt${k}`, "show the voice trend");
  manifest["vt-pre"] = manifest[`vt${k}-pre`]; manifest["vt-post"] = manifest[`vt${k}-post`];
}
await frame().locator("svg").first().waitFor({ timeout: 8000 }).catch(() => problems.push("voice card did not render"));
{ const fv = page.frames().find((f) => f !== page.mainFrame());
  await fv.evaluate(() => { const e = document.scrollingElement; e.scrollTo(0, e.scrollHeight); });
  await page.waitForTimeout(700);
  const o = await box(dev()); const lab = frame().getByText(/Voice range/).first();
  await shotDevice("vt-voice", { voice: rel(await box(lab), o), voiceHtml: null });
  writeFileSync(`${OUT}/vt.txt`, await frame().locator("body").innerText().catch(() => "")); }
await turn("sd", "Show the study dashboard");
await tallShot("dashboard-tall");
const fr = frame();
await fr.getByRole("button", { name: "Export FHIR" }).click();
await page.waitForTimeout(2500);
const status = await fr.locator("#export-status").innerText();
if (!/Wrote .*LANTERN-PILOT\.fhir\.json/.test(status)) problems.push("export status: " + status);
const exBtn = await box(fr.getByRole("button", { name: "Export FHIR" })), exSt = await box(fr.locator("#export-status")), od = await box(dev());
await shotDevice("dashboard-export", { exportButton: rel(exBtn, od), exportStatus: rel(exSt, od) });
manifest["dashboard-export"].status = status;
await page.getByRole("button", { name: "Close" }).click(); await page.waitForTimeout(500);
await turn("c1", "Alexa, join the Lantern pilot study");
await turn("c2", "yes, with my words");
await turn("e1", "I fell and my face feels numb.");
await page.getByRole("tab", { name: "Outbox" }).click();
await sideStyle(true); await page.waitForTimeout(1500);
const items2 = page.locator(".outbox-item");
const subj2 = await items2.allInnerTexts();
writeFileSync(`${OUT}/outbox-subjects-final.json`, JSON.stringify(subj2, null, 1));
await items2.first().click(); await page.waitForTimeout(600);
await shotSide("outbox-urgent", [{ name: "item", box: await box(items2.first()) }]);
await sideStyle(false);

// ---- real export files + real Inspector CLI output (for the terminal scenes)
const head = (f, n) => readFileSync(f, "utf8").split("\n").slice(0, n).join("\n");
const exportDir = `${ROOT}/exports`;
writeFileSync(`${OUT}/export-excerpt.json`, JSON.stringify({ csv: head(`${exportDir}/LANTERN-PILOT.csv`, 9), fhir: head(`${exportDir}/LANTERN-PILOT.fhir.json`, 60) }, null, 1));
const insp = (args) => { const t0 = Date.now(); const out = execFileSync("npx", ["-y", "@modelcontextprotocol/inspector", "--cli", "http://localhost:8787/mcp", "--transport", "http", ...args], { cwd: ROOT, encoding: "utf8", timeout: 120000 }); return { out, ms: Date.now() - t0 }; };
const cmds = {
  toolsList: ["--method", "tools/list"],
  getTrend: ["--method", "tools/call", "--tool-name", "get_trend", "--tool-arg", "participantId=rose", "--tool-arg", "audience=caregiver"],
};
const inspector = {};
for (const [k, a] of Object.entries(cmds)) { try { inspector[k] = { cmd: "npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --transport http " + a.join(" "), ...insp(a) }; } catch (e) { problems.push("inspector " + k + ": " + e.message.slice(0, 200)); } }
writeFileSync(`${OUT}/inspector.json`, JSON.stringify(inspector, null, 1));

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
writeFileSync(`${OUT}/turns.json`, JSON.stringify(turns, null, 1));
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "CAPTURE OK", `(${Object.keys(manifest).length} stills)`);
await browser.close();
cleanup();
process.exit(0);
