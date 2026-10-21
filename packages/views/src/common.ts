/** Shared helpers for the MCP App views: data bootstrap, theme, tiny SVG chart kit. */
import { App } from "@modelcontextprotocol/ext-apps";
import { PRODUCT } from "@lantern/shared";

export { PRODUCT };
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const CSS = `
:root{--paper:#F6F1E7;--ink:#1E2A32;--ink2:#3F4F58;--amber:#E8A33D;--amber-ink:#6B4208;--teal:#2B7A78;--teal-ink:#1D5654;--line:#D9CFBA;--card:#FFFDF8;--band:#CFE3DF}
@media (prefers-color-scheme:dark){:root{--paper:#161D22;--ink:#F3EDE0;--ink2:#C3CBCF;--amber-ink:#F0BC6A;--teal-ink:#7CC4BF;--line:#33424B;--card:#1D272D;--band:#244544}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--paper);color:var(--ink);font:400 20px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px 24px}
h1,h2,h3{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:600;margin:0;line-height:1.15}
h1{font-size:34px}h2{font-size:26px}h3{font-size:21px}
.muted{color:var(--ink2)}.small{font-size:16px}
.pill{display:inline-block;border-radius:999px;padding:4px 14px;font-size:17px;font-weight:600;border:2px solid var(--ink)}
.pill.steady{background:var(--teal);color:#fff;border-color:var(--teal)}
.pill.flag{background:var(--amber);color:#1E2A32;border-color:var(--amber)}
.pill.none{background:transparent;color:var(--ink)}
.row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.grid{display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.kpi{font-family:Fraunces,Georgia,serif;font-size:40px;font-weight:600;line-height:1}
button{font:600 18px Inter,system-ui,sans-serif;min-height:44px;padding:8px 18px;border-radius:12px;border:2px solid var(--ink);background:var(--card);color:var(--ink);cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
button.primary{background:var(--ink);color:var(--paper)}
svg text{font-family:Inter,system-ui,sans-serif;fill:var(--ink2)}
.disclaimer{font-size:15px;color:var(--ink2);border-top:1px solid var(--line);margin-top:20px;padding-top:10px}
@media print{body{background:#fff;color:#000;padding:0;font-size:12pt}.card{break-inside:avoid;border-color:#bbb}button,.noprint{display:none!important}:root{--paper:#fff;--card:#fff}}
`;

export const lanternGlyph = (size = 72) => `<svg width="${size}" height="${size}" viewBox="0 0 72 72" role="img" aria-label="Lantern"><rect x="30" y="4" width="12" height="7" rx="2" fill="#1E2A32"/><path d="M26 14h20l6 10v24l-6 8H26l-6-8V24z" fill="#E8A33D" stroke="#1E2A32" stroke-width="3" stroke-linejoin="round"/><path d="M36 22c5 6 5 10 0 16-5-6-5-10 0-16z" fill="#FFF3D6"/><rect x="28" y="58" width="16" height="6" rx="2" fill="#1E2A32"/></svg>`;

type Payload = Record<string, any>;
declare global { interface Window { __LANTERN_FIXTURE__?: Payload } }

/**
 * Wire a view to its data. Order: inline fixture (opened directly in a browser),
 * MCP Apps host (App class), and a postMessage shim `{type:"lantern:data", structuredContent}` as fallback.
 */
export function bootstrap(name: string, render: (data: Payload, app?: App) => string, mount = document.getElementById("app")!) {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const paint = (data: Payload, app?: App) => { try { mount.innerHTML = render(data, app); wire(mount, app); } catch (e) { mount.innerHTML = `<p>Something went wrong showing this view.</p>`; console.error(e); } };
  let app: App | undefined;
  window.addEventListener("message", (ev) => { if (ev.data?.type === "lantern:data" && ev.data.structuredContent) paint(ev.data.structuredContent, app); });
  if (window.__LANTERN_FIXTURE__) { paint(window.__LANTERN_FIXTURE__); return; }
  mount.innerHTML = `<p class="muted">Loading…</p>`;
  if (window.parent !== window) {
    app = new App({ name: `${PRODUCT.slug}-${name}`, version: "0.1.0" }, {}, { autoResize: true });
    app.ontoolresult = (params: any) => {
      const sc = params.structuredContent ?? safeParse(params.content?.[0]?.text);
      if (sc) paint(sc, app);
    };
    app.connect().catch((e: unknown) => console.warn("app.connect failed; waiting for postMessage shim", e));
  }
}
const safeParse = (t?: string) => { try { return t ? JSON.parse(t) : undefined; } catch { return undefined; } };

type Handler = (el: HTMLElement) => void;
const handlers = new Map<string, (app: App | undefined, el: HTMLElement) => void>();
export const onAction = (name: string, fn: (app: App | undefined, el: HTMLElement) => void) => handlers.set(name, fn);
function wire(root: HTMLElement, app?: App) {
  root.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => el.addEventListener("click", () => handlers.get(el.dataset.action!)?.(app, el)));
}
void (null as unknown as Handler);

/* ---------- SVG charts ---------- */
export interface ChartPoint { day: string; value: number; ewma?: number | null; weight?: number }
export interface ChartOpts {
  width?: number; height?: number; points: ChartPoint[]; baseline?: { mu: number; sigma: number } | null; higherIsBetter?: boolean;
  alertDay?: string | null; windowFrom?: string | null; label?: string; showAxis?: boolean; unit?: string; minimal?: boolean;
}
const R = (n: number) => Math.round(n * 10) / 10;

export function chart(o: ChartOpts): string {
  const W = o.width ?? 640, H = o.height ?? 180, padL = o.showAxis ? 44 : 6, padR = 8, padT = 10, padB = o.showAxis ? 28 : 6;
  const pts = o.points;
  if (pts.length < 2) return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Not enough data"><text x="10" y="${H / 2}" font-size="16">Not enough data yet</text></svg>`;
  const pol = o.higherIsBetter === false ? -1 : 1;
  const b = o.baseline;
  const ew = (p: ChartPoint) => (b && p.ewma != null ? b.mu + pol * p.ewma * b.sigma : null);
  const vals = pts.map((p) => p.value).concat(b ? [b.mu - b.sigma, b.mu + b.sigma] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const padV = (hi - lo) * 0.08; lo -= padV; hi += padV;
  const x = (i: number) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const idxOf = (day: string) => pts.findIndex((p) => p.day >= day);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label ?? "Trend chart")}">`;
  if (b) {
    s += `<rect x="${padL}" y="${R(y(b.mu + b.sigma))}" width="${W - padL - padR}" height="${R(y(b.mu - b.sigma) - y(b.mu + b.sigma))}" fill="var(--band)" opacity=".75"/>`;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${R(y(b.mu))}" y2="${R(y(b.mu))}" stroke="var(--teal)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }
  if (o.windowFrom) { const i = idxOf(o.windowFrom); if (i >= 0) s += `<rect x="${R(x(i))}" y="${padT}" width="${R(W - padR - x(i))}" height="${H - padT - padB}" fill="var(--amber)" opacity=".16"/>`; }
  if (o.showAxis) {
    for (const v of [lo + padV, (lo + hi) / 2, hi - padV]) s += `<text x="${padL - 6}" y="${R(y(v)) + 5}" font-size="14" text-anchor="end">${R(v)}</text>`;
    const step = Math.max(1, Math.floor(pts.length / 5));
    for (let i = 0; i < pts.length; i += step) s += `<text x="${R(x(i))}" y="${H - 6}" font-size="14" text-anchor="middle">${pts[i]!.day.slice(5)}</text>`;
  }
  s += `<polyline fill="none" stroke="var(--ink2)" stroke-opacity=".45" stroke-width="1.5" points="${pts.map((p, i) => `${R(x(i))},${R(y(p.value))}`).join(" ")}"/>`;
  for (const [i, p] of pts.entries()) {
    const low = (p.weight ?? 1) < 1;
    s += low ? `<circle cx="${R(x(i))}" cy="${R(y(p.value))}" r="5" fill="none" stroke="var(--ink)" stroke-width="2"><title>${esc(p.day)}: down-weighted day (poor sleep or a rough day)</title></circle>`
      : `<circle cx="${R(x(i))}" cy="${R(y(p.value))}" r="${o.minimal ? 1.8 : 2.6}" fill="var(--ink2)" fill-opacity=".7"/>`;
  }
  const line = pts.map((p, i) => [x(i), ew(p)] as const).filter((t) => t[1] != null);
  if (line.length > 1) s += `<polyline fill="none" stroke="var(--amber)" stroke-width="3.5" stroke-linejoin="round" points="${line.map(([px, v]) => `${R(px)},${R(y(v!))}`).join(" ")}"/>`;
  if (o.alertDay) { const i = idxOf(o.alertDay); if (i >= 0) s += `<line x1="${R(x(i))}" x2="${R(x(i))}" y1="${padT}" y2="${H - padB}" stroke="var(--amber-ink)" stroke-width="2.5"/><text x="${R(x(i)) - 6}" y="${padT + 14}" font-size="14" text-anchor="end" style="fill:var(--amber-ink);font-weight:600">flag</text>`; }
  return s + `</svg>`;
}

export function sparkline(values: number[], w = 140, h = 36): string {
  if (values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const lo = Math.min(...values), hi = Math.max(...values), d = hi - lo || 1;
  const pts = values.map((v, i) => `${R((i / (values.length - 1)) * (w - 4) + 2)},${R(h - 3 - ((v - lo) / d) * (h - 6))}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="var(--teal-ink)" stroke-width="2.2" points="${pts}"/></svg>`;
}

export function barChart(items: { label: string; value: number }[], w = 420, h = 160): string {
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (w - 20) / items.length;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Bar chart">${items.map((it, i) => {
    const bh = (it.value / max) * (h - 44);
    return `<rect x="${R(10 + i * bw + 6)}" y="${R(h - 26 - bh)}" width="${R(bw - 12)}" height="${R(bh)}" rx="4" fill="var(--teal)"/><text x="${R(10 + i * bw + bw / 2)}" y="${R(h - 30 - bh)}" font-size="16" text-anchor="middle" style="fill:var(--ink);font-weight:600">${it.value}</text><text x="${R(10 + i * bw + bw / 2)}" y="${h - 6}" font-size="14" text-anchor="middle">${esc(it.label)}</text>`;
  }).join("")}</svg>`;
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ok: { text: "Steady", cls: "steady" }, improving: { text: "Improving", cls: "steady" }, watch: { text: "Keeping an eye on it", cls: "flag" },
  notice: { text: "A gentle flag", cls: "flag" }, not_enough_data: { text: "Not enough check-ins yet", cls: "none" },
};
export const pill = (status: string) => { const s = STATUS_LABEL[status] ?? { text: status, cls: "none" }; return `<span class="pill ${s.cls}">${esc(s.text)}</span>`; };
export const footer = () => `<p class="disclaimer">${esc(PRODUCT.disclaimer)}</p>`;

/** Call an MCP tool from inside a view. Tries the sim/host postMessage bridge first, then the MCP Apps `App` as fallback. */
export function callTool(app: App | undefined, name: string, args: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.parent === window) return reject(new Error("Open this page inside a host to run tools."));
    const id = Math.random().toString(36).slice(2);
    let done = false, acked = false;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      if (e.data.type === "lantern:ack") acked = true;
      if (e.data.type === "lantern:result") { done = true; window.removeEventListener("message", onMsg); resolve(e.data.result); }
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "lantern:call", id, name, arguments: args }, "*");
    setTimeout(() => {
      if (done || acked) return; // a host that acked is working; wait for it
      window.removeEventListener("message", onMsg);
      if (app) (app as any).callServerTool({ name, arguments: args }).then(resolve, reject); else reject(new Error("The host did not answer."));
    }, 800);
  });
}
