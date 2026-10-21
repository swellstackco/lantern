import { bootstrap, chart, esc, footer, onAction, pill } from "./common.js";
bootstrap("doctor-summary", (d) => {
  const flagged = d.flaggedWindow;
  const alertDay = flagged?.to && d.series?.length ? (d.status === "notice" ? (flagged.from as string) : null) : null;
  const main = d.series.filter((s: any) => !s.tierB);
  const voice = d.series.filter((s: any) => s.tierB);
  const sleep = d.sleep as { day: string; hours: number }[];
  const sleepSvg = sleep.length > 1 ? chart({ points: sleep.map((s) => ({ day: s.day, value: s.hours })), height: 120, showAxis: true, label: "Sleep hours" }) : "";
  return `<div class="row" style="justify-content:space-between;align-items:flex-start"><div>
      <div class="small muted">${esc("Lantern summary for the doctor")} · ${esc(d.asOf)}</div>
      <h1>${esc(d.identity.name)}</h1>
      <p style="margin:4px 0 0">Age ${esc(d.identity.age)}${d.identity.city ? ` · ${esc(d.identity.city)}` : ""} · in Lantern since ${esc(d.identity.enrolledSince)} · check-ins done ${esc(d.adherence)}%</p>
    </div><div class="row">${pill(d.status)}<button class="noprint" data-action="print">Print this page</button></div></div>
    ${flagged ? `<div class="card" style="margin-top:14px;border-left:8px solid var(--amber)"><b>Flagged window:</b> ${esc(flagged.from)} to ${esc(flagged.to)}. Measures a bit below their own usual for about two weeks: ${esc(flagged.domains.join(", "))}. This is a reason to talk, not a diagnosis.</div>` : ""}
    <h2 style="margin:22px 0 8px">Last 90 days against their own usual</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">${main.map((s: any) => `<div class="card"><h3>${esc(s.label)}${s.experimental ? ' <span class="small muted">(experimental)</span>' : ""}</h3>${chart({ points: s.points, baseline: s.baseline, higherIsBetter: s.higherIsBetter, windowFrom: flagged?.from, alertDay, showAxis: true, height: 190, label: `${s.label}, 90 days` })}</div>`).join("")}</div>
    <div class="small muted" style="margin-top:6px">Band: their usual range (first 14 scored days). Amber line: smoothed recent change. Open ring: a down-weighted day (poor sleep or a rough day). Shaded area: flagged window.</div>
    <h2 style="margin:22px 0 8px">Change table</h2>
    <table style="width:100%;border-collapse:collapse;font-size:18px"><thead><tr style="text-align:left;border-bottom:2px solid var(--ink)"><th style="padding:6px">Measure</th><th>Reliable Change Index</th><th>Reliable change?</th></tr></thead><tbody>
    ${d.rciTable.map((r: any) => `<tr style="border-bottom:1px solid var(--line)"><td style="padding:8px 6px">${esc(r.label)}${r.experimental ? ' <span class="small muted">(experimental)</span>' : ""}</td><td>${esc(r.rci)}</td><td>${r.reliableChange ? "<b>Yes</b> (beyond 1.96)" : "No"}</td></tr>`).join("")}</tbody></table>
    <p class="small muted">Reliable Change Index compares the last 14 scored days with their own first 14 scored days. Beyond 1.96 or below -1.96 is unlikely to be chance. Thresholds are placeholders until validated.</p>
    ${sleepSvg ? `<h2 style="margin:22px 0 8px">Sleep (hours, as they told us)</h2><div class="card">${sleepSvg}</div>` : ""}
    ${voice.length ? `<h2 style="margin:22px 0 8px">Voice (experimental, simulator only)</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">${voice.map((s: any) => `<div class="card"><h3>${esc(s.label)}</h3>${chart({ points: s.points, baseline: s.baseline, higherIsBetter: s.higherIsBetter, showAxis: true, height: 160, label: s.label })}</div>`).join("")}</div><p class="small muted">Measured in the browser simulator only. A real Alexa+ add-on cannot see these numbers today.</p>` : ""}
    <h2 style="margin:22px 0 8px">What Lantern does not measure</h2><ul style="font-size:18px;margin:0;padding-left:22px">${d.notMeasured.map((n: string) => `<li>${esc(n)}</li>`).join("")}</ul>
    ${footer()}`;
});
onAction("print", () => window.print());
