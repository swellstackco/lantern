import { describe, expect, it } from "vitest";
import { SqliteRepo } from "./storage/sqlite.js";
import { dailySeries, computeBaselines, refreshAlerts } from "./engine.js";
import type { Participant } from "@lantern/shared";

const P: Participant = { id: "p1", name: "Test Person", birthYear: 1958, tz: "America/Phoenix", careCircle: [{ name: "Kid", email: "kid@example.com" }], mode: "atRisk", baseline: {}, createdAt: "2026-01-01", dateShiftDays: -100, synthetic: true };

function addDay(repo: SqliteRepo, day: string, recall: number, weight = 1, sid = `s-${day}`) {
  repo.addSession({ id: sid, participantId: "p1", slot: "morning", startedAt: day + "T09:00:00Z", weight, day });
  repo.addObservation({ id: `o-${sid}`, sessionId: sid, domain: "recall", itemId: "x", raw: "t", score: recall });
}

describe("SqliteRepo", () => {
  it("round-trips participant, sessions, observations, facts, alerts, outbox, kv", () => {
    const r = new SqliteRepo(); r.upsertParticipant(P);
    expect(r.getParticipant("p1")).toEqual(P);
    addDay(r, "2026-02-01", 2);
    expect(r.listSessions("p1")).toHaveLength(1);
    expect(r.observationsForParticipant("p1")[0]).toMatchObject({ day: "2026-02-01", score: 2, weight: 1 });
    r.addFact({ participantId: "p1", date: "2026-02-01", kind: "dayStory", text: "garden" });
    expect(r.listFacts("p1", "dayStory")[0]!.text).toBe("garden");
    r.addAlert({ id: "a1", participantId: "p1", level: "notice", domains: ["recall"], openedAt: "2026-02-10" });
    expect(r.openAlert("p1")?.id).toBe("a1");
    r.updateAlert("a1", { closedAt: "2026-03-01" }); expect(r.openAlert("p1")).toBeUndefined();
    r.addOutbox({ id: "m1", channel: "email", to: "kid@example.com", subject: "s", body: "b", createdAt: "2026-02-10T00:00:00Z" });
    expect(r.listOutbox()).toHaveLength(1);
    r.setKv("today", "2026-02-02"); expect(r.getKv("today")).toBe("2026-02-02");
    r.reset(); expect(r.listParticipants()).toHaveLength(0);
  });
  it("studies and enrollments", () => {
    const r = new SqliteRepo();
    r.upsertStudy({ studyCode: "LANTERN-PILOT", name: "Pilot", cadence: "daily", domainsEnabled: ["recall"], consentVersion: "1.0", consentText: "hi", piContact: "pi@example.com" });
    r.upsertEnrollment({ participantId: "p1", studyCode: "LANTERN-PILOT", tier: 2, consentVersion: "1.0", consentedAt: "2026-02-01" });
    expect(r.getStudy("lantern-pilot")?.name).toBe("Pilot");
    expect(r.listEnrollments("LANTERN-PILOT")).toHaveLength(1);
  });
});

describe("engine", () => {
  it("aggregates a weighted daily mean and builds baselines after 14 days", () => {
    const r = new SqliteRepo(); r.upsertParticipant(P);
    r.addSession({ id: "a", participantId: "p1", slot: "morning", startedAt: "2026-02-01T09:00:00Z", weight: 1, day: "2026-02-01" });
    r.addSession({ id: "b", participantId: "p1", slot: "evening", startedAt: "2026-02-01T19:00:00Z", weight: 0.5, day: "2026-02-01" });
    r.addObservation({ id: "1", sessionId: "a", domain: "recall", itemId: "x", raw: "", score: 3 });
    r.addObservation({ id: "2", sessionId: "b", domain: "recall", itemId: "x", raw: "", score: 0 });
    const s = dailySeries(r, "p1");
    expect(s.recall).toHaveLength(1); expect(s.recall![0]!.value).toBeCloseTo(2, 5); expect(s.recall![0]!.nObs).toBe(2);
    expect(computeBaselines(s).recall).toBeUndefined();
  });
  it("opens an alert once for a sustained drop in two domains, with re-alert suppression", () => {
    const r = new SqliteRepo(); r.upsertParticipant(P);
    const d0 = Date.parse("2026-01-01");
    const day = (i: number) => new Date(d0 + i * 86400000).toISOString().slice(0, 10);
    let opened = 0;
    for (let i = 0; i < 50; i++) {
      const drift = i >= 20;
      const sid = `s${i}`;
      r.addSession({ id: sid, participantId: "p1", slot: "morning", startedAt: day(i) + "T09:00:00Z", weight: 1, day: day(i) });
      const wob = (i % 3) * 0.1;
      r.addObservation({ id: `r${i}`, sessionId: sid, domain: "recall", itemId: "x", raw: "", score: (drift ? 1.2 : 2.6) + wob });
      r.addObservation({ id: `f${i}`, sessionId: sid, domain: "fluency", itemId: "x", raw: "", score: (drift ? 7 : 11) + wob * 5 });
      if (i === 13) { const p = r.getParticipant("p1")!; p.baseline = computeBaselines(dailySeries(r, "p1")); r.upsertParticipant(p); }
      if (i >= 14) { const { opened: o } = refreshAlerts(r, "p1", day(i)); if (o) opened++; }
    }
    expect(opened).toBe(1);
    expect(r.openAlert("p1")?.domains.length).toBeGreaterThanOrEqual(2);
  });
});
