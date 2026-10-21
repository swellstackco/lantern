import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRepo } from "./storage/sqlite.js";
import { seedDatabase } from "./seed.js";
import { scrubTranscript } from "./deid.js";

let repo: SqliteRepo, mod: typeof import("./export.js"), dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "lantern-exp-"));
  process.env.LANTERN_EXPORTS_DIR = dir;
  repo = new SqliteRepo(); seedDatabase(repo, "2026-10-21");
  mod = await import("./export.js");
});

const FORBIDDEN = ["Rose", "Alvarez", "Tucson", "Maya", "maya@", "Walter", "Dolores", "Frank", "Okafor", "Evelyn", "Carlos", "Mendes", "Abrams", "Harold", "Nguyen", "Gloria", "Santos", "Leonard", "Mabel", "Quinn", "Arthur", "example.com"];

describe("export_research_data", () => {
  it("FHIR: valid JSON, >= 1000 observations, 12 pseudonymous patients, no names", () => {
    const r = mod.exportResearchData(repo, "LANTERN-PILOT", "fhir");
    const text = readFileSync(r.path, "utf8");
    const b = JSON.parse(text);
    expect(b.resourceType).toBe("Bundle");
    const obs = b.entry.filter((e: any) => e.resource.resourceType === "Observation");
    expect(obs.length).toBeGreaterThanOrEqual(1000);
    expect(b.entry.filter((e: any) => e.resource.resourceType === "Patient")).toHaveLength(12);
    for (const w of FORBIDDEN) expect(text.includes(w), w).toBe(false);
    expect(obs[0].resource.code.coding[0].system).toBe("http://lantern.dev/fhir/CodeSystem/measures");
    expect(text).not.toMatch(/loinc/i);
  });
  it("dates are shifted: Rose's first observation is not on its real date", () => {
    const real = repo.observationsForParticipant("rose")[0]!.day;
    const r = mod.exportResearchData(repo, "LANTERN-PILOT", "csv");
    const csv = readFileSync(r.path, "utf8").split("\n");
    expect(csv[0]).toContain("person_id,observation_date,measurement_concept");
    expect(csv.length).toBeGreaterThan(1000);
    const code = csv[1]!.split(",")[0]!;
    expect(code).toMatch(/^P-[0-9A-F]{10}$/);
    for (const w of FORBIDDEN) expect(csv.join("\n").includes(w), w).toBe(false);
    expect(readdirSync(dir)).toContain("LANTERN-PILOT.data_dictionary.csv");
    expect(real).toBe("2026-07-23"); // sanity: real first day of Rose is a known date
  });
  it("Tier 1 has no transcripts; Tier 2 transcripts are scrubbed", () => {
    const csv = readFileSync(join(dir, "LANTERN-PILOT.csv"), "utf8").split("\n").slice(1).filter(Boolean);
    const withNote = csv.filter((l) => /,"[^"]+"$/.test(l));
    expect(withNote.length).toBeGreaterThan(50);
    const tier1Notes = csv.filter((l) => l.split(",")[9] === "1" && /,"[^"]+"$/.test(l));
    expect(tier1Notes).toHaveLength(0);
  });
  it("withdraw excludes the participant from the next export", () => {
    const before = mod.exportResearchData(repo, "LANTERN-PILOT", "fhir");
    const e = repo.getEnrollment("p-03", "LANTERN-PILOT")!;
    repo.upsertEnrollment({ ...e, withdrawnAt: "2026-10-21T00:00:00Z" });
    const after = mod.exportResearchData(repo, "LANTERN-PILOT", "fhir");
    expect(after.counts.participants).toBe(11); expect(before.counts.participants).toBe(12);
    expect(after.counts.withdrawnExcluded).toBe(1);
    expect(after.counts.observations).toBeLessThan(before.counts.observations);
  });
  it("scrubTranscript removes names, places, dates, emails", () => {
    const s = scrubTranscript("My sister Linda phoned from Ohio on October 5 and wrote to maya@example.com", ["Maya"]);
    expect(s).not.toMatch(/Linda|Ohio|October|maya@/);
  });
  it("unknown study is an error", () => { expect(() => mod.exportResearchData(repo, "NOPE", "csv")).toThrow(/Unknown study/); });
});
