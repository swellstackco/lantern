import { bootstrap, esc, footer } from "./common.js";
bootstrap("consent-card", (d) => `<h1>${esc(d.study.name)}</h1><p class="muted small">Study code ${esc(d.study.studyCode)} · version ${esc(d.consentVersion)}</p>
  ${String(d.consentSummary).split(/\n\n+/).map((p) => `<p style="font-size:21px;max-width:60ch">${esc(p)}</p>`).join("")}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${d.tiers.map((t: any) => `<div class="card"><b>${esc(t.label)}</b></div>`).join("")}</div>${footer()}`);
