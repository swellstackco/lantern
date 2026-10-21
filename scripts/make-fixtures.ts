/** Builds fixture JSON from seeded data and writes standalone HTML pages you can open directly in a browser. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SqliteRepo } from "../packages/server/src/storage/sqlite.js";
import { seedDatabase } from "../packages/server/src/seed.js";
import { getDoctorSummary, getTrend } from "../packages/server/src/trend.js";
import { startCheckin } from "../packages/server/src/checkin.js";
import { consentSummary, studyDashboard } from "../packages/server/src/research.js";
import { ROOT } from "../packages/server/src/paths.js";

const today = process.env.LANTERN_TODAY ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
const repo = new SqliteRepo();
seedDatabase(repo, today);
const rose = repo.getParticipant("rose")!;
const c = consentSummary(repo, "LANTERN-PILOT")!;
const fixtures: Record<string, unknown> = {
  "checkin-card": startCheckin(repo, rose, "morning"),
  "trend-card": getTrend(repo, rose, "caregiver", 90),
  "trend-card-participant": getTrend(repo, rose, "participant"),
  "trend-card-clinician": getTrend(repo, rose, "clinician", 90),
  "doctor-summary": getDoctorSummary(repo, rose),
  "study-dashboard": studyDashboard(repo, "LANTERN-PILOT"),
  "consent-card": { study: c.study, consentSummary: c.consentText, consentVersion: c.consentVersion, tiers: c.tiers },
};
const dir = join(ROOT, "packages", "views");
mkdirSync(join(dir, "fixtures"), { recursive: true });
mkdirSync(join(dir, "dist", "fixtures"), { recursive: true });
for (const [name, data] of Object.entries(fixtures)) {
  writeFileSync(join(dir, "fixtures", `${name}.json`), JSON.stringify(data, null, 1));
  const base = name.replace(/-(participant|clinician)$/, "");
  const html = readFileSync(join(dir, "dist", "views", `${base}.html`), "utf8");
  const inject = `<script>window.__LANTERN_FIXTURE__=${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
  writeFileSync(join(dir, "dist", "fixtures", `${name}.html`), html.replace("<body>", `<body>${inject}`));
}
console.log("fixtures written to packages/views/dist/fixtures/*.html");
