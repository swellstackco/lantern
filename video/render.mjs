// Deterministic frame renderer: scene.html exposes renderAt(t); every frame is a pure function of t.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir } from "node:os";

const MIME = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".js": "text/javascript" };
export function chromePath() {
  const base = join(homedir(), ".cache/puppeteer/chrome");
  const dirs = readdirSync(base).filter((d) => d.startsWith("mac_arm-")).sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
  for (const d of dirs) { const p = join(base, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"); if (existsSync(p)) return p; }
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}
export async function renderFrames({ dir, frames, duration, fps, workers = 3, t0 = 0 }) {
  const server = createServer((req, res) => {
    const f = join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dir) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--mute-audio", "--force-device-scale-factor=1", "--hide-scrollbars"] });
  const N = Math.ceil(duration * fps); const per = Math.ceil(N / workers);
  let done = 0; const t00 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://127.0.0.1:${port}/scene.html`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    for (let i = w * per; i < Math.min(N, (w + 1) * per); i++) {
      await page.evaluate((t) => window.renderAt(t), i / fps);
      await page.screenshot({ path: `${frames}/f${String(i + 1).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
      if (++done % 300 === 0) console.log(`frames ${done}/${N} (${((Date.now() - t00) / 1000).toFixed(0)}s)`);
    }
    await ctx.close();
  }));
  await browser.close(); server.close();
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  // single-frame preview: node video/render.mjs <seconds> <out.jpg>
  const dir = new URL("./", import.meta.url).pathname; const t = parseFloat(process.argv[2]);
  const { mkdirSync } = await import("node:fs");
  const server = createServer((req, res) => { const f = join(dir, decodeURIComponent(req.url.split("?")[0])); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--mute-audio"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => console.error("pageerror", String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/scene.html`);
  await page.waitForFunction(() => window.ready === true);
  for (const tt of process.argv.slice(2, -1)) { await page.evaluate((x) => window.renderAt(x), parseFloat(tt)); await page.screenshot({ path: `${process.argv.at(-1).replace(/\.jpg$/, "")}-${tt}.jpg`, type: "jpeg", quality: 90 }); }
  await browser.close(); server.close();
}
