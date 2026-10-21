import { bootstrap, chart, esc, footer, lanternGlyph, pill } from "./common.js";
const SHOW = ["recall", "fluency", "consistency"];
bootstrap("trend-card", (d) => {
  if (d.audience === "participant") {
    const tone = d.status === "steady" ? "steady" : "flag";
    return `<div class="row" style="gap:24px;min-height:200px"><div>${lanternGlyph(96)}</div><div>
      <h1>${d.status === "steady" ? "Steady" : d.status === "mixed" ? "A little up and down" : "Let's keep going"}</h1>
      <p style="font-size:24px;max-width:30ch;margin:8px 0 0">${esc(d.words)}</p>
      ${d.streakDays ? `<p class="muted" style="margin:10px 0 0">${d.streakDays} days in a row</p>` : ""}</div></div><span hidden class="${tone}"></span>`;
  }
  const alertDay = d.alert?.openedAt as string | undefined;
  const mini = (s: any, label?: string) => `<div class="card"><div class="row" style="justify-content:space-between"><h3>${esc(label ?? s.label)}</h3>${s.experimental ? '<span class="small muted">experimental</span>' : ""}</div>
    ${chart({ points: s.points, baseline: s.baseline, higherIsBetter: s.higherIsBetter, alertDay, height: 130, label: `${s.label} trend`, minimal: true })}</div>`;
  const main = SHOW.map((k) => d.series.find((x: any) => x.domain === k)).filter(Boolean);
  const voice = d.audience === "clinician" ? d.series.find((x: any) => x.domain === "f0Iqr") : null;
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h2>${esc(d.participant.name)}</h2><div class="muted small">Last ${d.days} days, compared with their own usual</div></div>${pill(d.status)}</div>
    <p style="margin:0 0 14px;font-size:21px">${esc(d.sentence)}</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${main.map((s: any) => mini(s)).join("")}${voice ? mini(voice, "Voice range (experimental, simulator only)") : ""}</div>
    <div class="row small muted" style="margin-top:12px;gap:24px"><span>Check-ins done: <b style="color:var(--ink)">${d.adherence}%</b></span><span>Shaded band = their usual range</span><span>Amber line = recent drift</span><span>Open ring = down-weighted day</span></div>${footer()}`;
});
