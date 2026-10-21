import { describe, expect, it } from "vitest";
import { SqliteRepo } from "./storage/sqlite.js";
import { seedDatabase, ROSE_ID } from "./seed.js";

const TODAY = "2026-10-21";
describe("seed", () => {
  const repo = new SqliteRepo();
  const rows = seedDatabase(repo, TODAY);
  it("opens Rose's alert on day 70-85 and not before drift", () => {
    const rose = rows.find((r) => r.id === ROSE_ID)!;
    expect(rose.alertDay).toBeGreaterThanOrEqual(70); expect(rose.alertDay).toBeLessThanOrEqual(85);
    expect(repo.openAlert(ROSE_ID)).toBeDefined();
  });
  it("day 38 outlier is down-weighted and never alerts", () => {
    const sessions = repo.listSessions(ROSE_ID).filter((s) => s.day === "2026-08-29"); // day 38 of 90 ending 2026-10-20 = 2026-08-29
    expect(sessions.length).toBe(3);
    expect(sessions.every((s) => s.weight === 0.5)).toBe(true);
    expect(sessions[0]!.context?.sleepHours).toBe(3.5);
    const recall = repo.observationsForParticipant(ROSE_ID, "recall").find((o) => o.day === "2026-08-29")!;
    expect(recall.score).toBe(1);
    expect(repo.listAlerts(ROSE_ID).every((a) => a.openedAt > "2026-08-29")).toBe(true);
  });
  it("cohort mix: stable members never alert, low adherence is not_enough_data, recovery improves", () => {
    for (const id of ["p-01", "p-02", "p-03", "p-04", "p-05", "p-06", "p-07"]) expect(rows.find((r) => r.id === id)!.alertDay, id).toBeNull();
    expect(rows.find((r) => r.id === "p-11")!.finalStatus).toBe("not_enough_data");
    expect(rows.find((r) => r.id === "p-10")!.finalStatus).toBe("improving");
    expect(rows.filter((r) => r.alertDay !== null && r.id !== ROSE_ID).length).toBe(2);
  });
  it("is enrolled and has 12 people, 90 days, today untouched", () => {
    expect(repo.listParticipants()).toHaveLength(12);
    expect(repo.listEnrollments("LANTERN-PILOT")).toHaveLength(12);
    expect(repo.listSessions(ROSE_ID).some((s) => s.day === TODAY)).toBe(false);
    expect(repo.listFacts(ROSE_ID, "dayStory").length).toBeGreaterThan(70);
  });
  it("is deterministic", () => {
    const r2 = new SqliteRepo(); const rows2 = seedDatabase(r2, TODAY);
    expect(rows2.map((r) => [r.id, r.alertDay, r.sessions])).toEqual(rows.map((r) => [r.id, r.alertDay, r.sessions]));
  });
});
