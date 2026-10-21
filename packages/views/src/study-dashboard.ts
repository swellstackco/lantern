import { barChart, bootstrap, esc, footer, onAction, pill, sparkline } from "./common.js";
bootstrap("study-dashboard", (d) => {
  const code = esc(d.study.studyCode);
  return `<div class="row" style="justify-content:space-between"><div><div class="small muted">Study dashboard · ${esc(d.study.cadence)} cadence</div><h1>${esc(d.study.name)}</h1><div class="muted small">Code ${code} · pseudonymous codes only</div></div>
    <div class="row"><button data-action="export-fhir" data-study="${code}" class="primary">Export FHIR</button><button data-action="export-csv" data-study="${code}">Export CSV</button></div></div>
    <p id="export-status" class="small muted" role="status" style="min-height:24px;margin:8px 0"></p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:6px 0 16px">
      <div class="card"><div class="kpi">${esc(d.enrolled)}</div><div class="muted">enrolled</div></div>
      <div class="card"><div class="kpi">${esc(d.flags)}</div><div class="muted">gentle flags</div></div>
      <div class="card"><div class="kpi">${esc(d.withdrawn)}</div><div class="muted">withdrawn</div></div></div>
    <div class="grid" style="grid-template-columns:minmax(280px,1fr) 2fr">
      <div class="card"><h3 style="margin-bottom:6px">Check-ins done</h3>${barChart(d.adherenceHistogram.map((b: any) => ({ label: b.label.replace("%", ""), value: b.count })))}<div class="small muted">Percent of days with a check-in, 14 days</div></div>
      <div class="card"><h3 style="margin-bottom:6px">People</h3><table style="width:100%;border-collapse:collapse;font-size:17px"><tbody>
      ${d.participants.map((p: any) => `<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 4px"><b>${esc(p.code)}</b> <span class="small muted">Tier ${esc(p.tier)}</span></td><td>${sparkline(p.spark, 120, 30)}</td><td>${esc(p.adherence)}%</td><td>${pill(p.status)}</td></tr>`).join("")}</tbody></table></div></div>
    ${footer()}`;
});
async function runExport(app: any, el: HTMLElement, format: "fhir" | "csv") {
  const status = document.getElementById("export-status")!;
  if (!app) { status.textContent = "Exports run when this page is open inside a host."; return; }
  status.textContent = "Exporting…";
  try {
    const r = await app.callServerTool({ name: "export_research_data", arguments: { studyCode: el.dataset.study, format } });
    const sc = r.structuredContent ?? JSON.parse(r.content?.[0]?.text ?? "{}");
    status.textContent = r.isError ? `Export failed: ${r.content?.[0]?.text}` : `Wrote ${sc.path} (${JSON.stringify(sc.counts)})`;
  } catch (e) { status.textContent = `Export failed: ${(e as Error).message}`; }
}
onAction("export-fhir", (app, el) => runExport(app, el, "fhir"));
onAction("export-csv", (app, el) => runExport(app, el, "csv"));
