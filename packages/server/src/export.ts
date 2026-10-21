import type { Repo } from "./storage/repo.js";
export function exportResearchData(_repo: Repo, _studyCode: string, _format: "fhir" | "csv", _since?: string): Record<string, unknown> {
  throw new Error("export_research_data is built in task T10.");
}
