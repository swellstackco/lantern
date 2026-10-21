import { describe, expect, it } from "vitest";
import { SqliteRepo } from "./storage/sqlite.js";
import { seedDatabase } from "./seed.js";
import { digestBody, noticeBody, sparkSvg } from "./digest.js";
import { notifyCareCircle } from "./outbox.js";

process.env.LANTERN_OUTBOX_DIR = "/tmp/lantern-test-outbox-digest";
const repo = new SqliteRepo(); seedDatabase(repo, "2026-10-21", { outbox: true });
const rose = repo.getParticipant("rose")!;
describe("digest and notice emails", () => {
  it("seed with outbox puts one notice email for Maya in the outbox", () => {
    const o = repo.listOutbox();
    expect(o).toHaveLength(1); expect(o[0]!.to).toBe("maya@example.com"); expect(o[0]!.subject).toMatch(/gentle note about Rose/); expect(o[0]!.body).toContain("<svg");
  });
  it("digest has one plain sentence, sparklines, adherence, and no scary words", () => {
    const h = digestBody(repo, rose);
    expect(h).toMatch(/Rose's week/); expect(h.match(/<svg/g)!.length).toBe(3); expect(h).toMatch(/of 7 days/);
    expect(h.replace(/<svg[\s\S]*?<\/svg>/g, "").toLowerCase()).not.toMatch(/declin|stroke|dementia|alzheimer/);
  });
  it("notice email says may be worth a check-up and carries the disclaimer", () => {
    const e = notifyCareCircle(repo, rose, "notice");
    expect(e.previewText).toMatch(/worth a check-up/);
    expect(repo.listOutbox()[0]!.body).toContain("does not diagnose");
    expect(noticeBody(repo, rose)).not.toMatch(/declin/i);
  });
  it("notify digest without a message builds the real digest", () => {
    const e = notifyCareCircle(repo, rose, "digest");
    expect(e.delivered).toEqual(["local-outbox"]); expect(e.previewText).toMatch(/Rose's week/);
  });
  it("sparkSvg handles tiny inputs", () => { expect(sparkSvg([1])).toBe(""); expect(sparkSvg([1, 2, 3])).toContain("polyline"); });
});
