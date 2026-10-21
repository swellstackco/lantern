// Walks the whole VIDEO-SCRIPT path in the simulator, muted and headless, and checks each beat. Usage: node scripts/e2e-video.mjs [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "e2e-video";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1720, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e));
await page.goto("http://localhost:5173");
await page.getByText("MCP connected").waitFor({ timeout: 15000 });
await page.getByLabel("Alexa voice").uncheck();
const ribbon = () => page.locator(".ribbon").innerText();
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` });
const say = async (t, expect, wait = 900) => {
  await page.getByLabel("What Rose says").fill(t);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(wait);
  const r = await ribbon();
  if (expect && !new RegExp(expect, "i").test(r)) problems.push(`"${t}" -> expected /${expect}/ in ribbon, got: ${r.replace(/\n/g, " | ").slice(-220)}`);
  return r;
};
await shot("ambient");
// 0:20 morning
await say("Alexa, good morning", "Good morning, Rose");
await shot("morning-card");
await say("About five hours", "What day is it today");
let r = await say("Tuesday", "Three words for later");
if (/apple|candle|river/i.test(r)) problems.push("the three words are visible on screen");
await say("ok", "Have a good morning");
// midday
await say("Alexa, good afternoon", "three words do you remember");
await say("Apple... river", "other was candle");
await say("dog, cat, horse, cow, pig, chicken, lion, tiger", "Eight");
await shot("midday-story");
await say("She won second place", "That's all for now");
// 0:50 drawer
await page.getByRole("tab", { name: "JSON-RPC" }).click();
await shot("drawer");
await page.getByRole("tab", { name: "Talk" }).click();
// 1:00 trend for Maya
await say("Alexa, show Maya how Mom's doing", "doctor visit", 1500);
await shot("trend-card");
// 1:30 outbox + visit
await say("Friday ten", "added the visit", 1200);
await page.getByRole("tab", { name: "Outbox" }).click(); await page.waitForTimeout(1200);
await shot("outbox");
await page.getByRole("tab", { name: "Talk" }).click();
// 1:45 doctor summary
await say("Show the doctor summary", "one-page summary", 1500);
await shot("doctor-summary");
await page.getByRole("button", { name: "Close" }).click();
// voice sparkline (clinician)
await say("show the voice trend", "how Rose is doing", 1500);
await shot("clinician-voice");
// 2:05 dashboard + export
await say("Show the study dashboard", "12 people are enrolled", 1500);
const fr = page.frameLocator("iframe").first();
await fr.getByRole("button", { name: "Export FHIR" }).click();
await page.waitForTimeout(2500);
const status = await fr.locator("#export-status").innerText();
if (!/Wrote .*LANTERN-PILOT\.fhir\.json/.test(status)) problems.push("export status: " + status);
await shot("dashboard-export");
await page.getByRole("button", { name: "Close" }).click();
// consent card
await say("Alexa, join the Lantern pilot study", "Would you like to join", 1500);
await shot("consent-card");
await say("yes, with my words", "signed up");
// 2:42 emergency
await say("I fell and my face feels numb", "911");
await page.getByRole("tab", { name: "Outbox" }).click(); await page.waitForTimeout(1500);
await shot("urgent-email");
const box = await page.locator(".side").innerText();
if (!/Please check on Rose now/.test(box)) problems.push("urgent email missing from outbox");
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "VIDEO PATH OK");
await browser.close();
