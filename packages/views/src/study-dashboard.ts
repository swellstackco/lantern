import { barChart, bootstrap, callTool, esc, footer, onAction, pill, sparkline } from "./common.js";
bootstrap("study-dashboard", (d) => {
  const code = esc(d.study.studyCode);
  return `<div class="row" style="justify-content:space-between"><div><div class="small muted">Study dashboard · ${esc(d.study.cadence)} cadence</div><h1>${esc(d.study.name)}</h1><div class="muted small">Code ${code} · pseudonymous codes only</div></div>
    <div class="row"><button data-action="export-fhir" data-study="${code}" class="primary">Export FHIR</button><button data-action="export-csv" data-study="${code}">Export CSV</button></div></div>
    <p id="export-status" class="small muted" role="status" style="min-height:24px;margin:8px 0"></p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:4px 0 10px">
      <div class="card"><div class="kpi" style="font-size:34px">${esc(d.enrolled)}</div><div class="muted">enrolled</div></div>
      <div class="card"><div class="kpi" style="font-size:34px">${esc(d.flags)}</div><div class="muted">gentle flags</div></div>
      <div class="card"><div class="kpi" style="font-size:34px">${esc(d.withdrawn)}</div><div class="muted">withdrawn</div></div></div>
    <div class="grid" style="grid-template-columns:minmax(280px,1fr) 2fr">
      <div class="card"><h3 style="margin-bottom:6px">Check-ins done</h3>${barChart(d.adherenceHistogram.map((b: any) => ({ label: b.label.replace("%", ""), value: b.count })))}<div class="small muted">Percent of days with a check-in, 14 days</div></div>
      <div class="card"><h3 style="margin-bottom:6px">People</h3><table style="width:100%;border-collapse:collapse;font-size:16px"><tbody>
      ${d.participants.map((p: any) => `<tr style="border-bottom:1px solid var(--line)"><td style="padding:2px 4px"><b>${esc(p.code)}</b> <span class="small muted">Tier ${esc(p.tier)}</span></td><td>${sparkline(p.spark, 120, 24)}</td><td>${esc(p.adherence)}%</td><td>${pill(p.status)}</td></tr>`).join("")}</tbody></table></div></div>
    ${footer()}`;
});
async function runExport(app: any, el: HTMLElement, format: "fhir" | "csv") {
  const status = document.getElementById("export-status")!;
  status.textContent = "Exporting…";
  try {
    const r = await callTool(app, "export_research_data", { studyCode: el.dataset.study, format });
    const sc = r.structuredContent ?? JSON.parse(r.content?.[0]?.text ?? "{}");
    status.textContent = r.isError ? `Export failed: ${r.content?.[0]?.text}` : `Wrote ${String(sc.path).split("/").slice(-2).join("/")}: ${sc.counts.participants} people, ${sc.counts.observations} measures, dates shifted, names removed.`;
  } catch (e) { status.textContent = `Export failed: ${(e as Error).message}`; }
}
onAction("export-fhir", (app, el) => runExport(app, el, "fhir"));
onAction("export-csv", (app, el) => runExport(app, el, "csv"));
