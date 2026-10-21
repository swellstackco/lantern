import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { SqliteRepo } from "./storage/sqlite.js";
import { seedDatabase } from "./seed.js";
import { createApp } from "./index.js";

let server: Server, base: string, repo: SqliteRepo;
const TODAY = "2026-10-21";
beforeAll(async () => {
  process.env.LANTERN_NOW = `${TODAY}T17:00:00Z`; // 10:00 in Phoenix
  process.env.LANTERN_OUTBOX_DIR = "/tmp/lantern-test-outbox";
  repo = new SqliteRepo(); seedDatabase(repo, TODAY);
  server = createApp(repo).listen(0);
  base = `http://localhost:${(server.address() as any).port}`;
});
afterAll(() => { server.close(); delete process.env.LANTERN_NOW; });

let id = 1;
async function rpc(method: string, params?: object) {
  const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }) });
  return (await r.json()) as any;
}
const call = async (name: string, args: object) => { const r = await rpc("tools/call", { name, arguments: args }); return r.result; };

describe("MCP over Streamable HTTP", () => {
  it("initializes with both protocol versions", async () => {
    for (const v of ["2025-11-25", "2025-03-26"]) {
      const r = await rpc("initialize", { protocolVersion: v, capabilities: {}, clientInfo: { name: "t", version: "0" } });
      expect(r.result.protocolVersion).toBe(v);
    }
  });
  it("lists 13 tools with description, inputSchema and outputSchema", async () => {
    const r = await rpc("tools/list");
    expect(r.result.tools).toHaveLength(13);
    for (const t of r.result.tools) { expect(t.description.length, t.name).toBeGreaterThan(40); expect(t.inputSchema, t.name).toBeDefined(); expect(t.outputSchema, t.name).toBeDefined(); }
    expect(r.result.tools.find((t: any) => t.name === "start_checkin")._meta.ui.resourceUri).toBe("ui://lantern/checkin-card");
  });
  it("GET /mcp is 405 (stateless)", async () => { expect((await fetch(`${base}/mcp`)).status).toBe(405); });
  it("runs morning, midday, evening for Rose", async () => {
    const before = repo.listSessions("rose").length;
    const m = (await call("start_checkin", { participantId: "rose", slot: "morning" })).structuredContent;
    expect(m.items.map((i: any) => i.type)).toEqual(["context", "orientation", "give_words"]);
    expect(m.items[2].suggestedPhrasing).toMatch(/Three words to hold onto/);
    const words = m.items[2].stimuli.words as string[];
    let r = (await call("record_answer", { sessionId: m.sessionId, itemId: "context-1", transcript: "Not great, maybe five hours." })).structuredContent;
    expect(r.feedbackPhrasing).toMatch(/Five hours/);
    expect(repo.getSession(m.sessionId)!.weight).toBe(1); // five is not under five
    r = (await call("record_answer", { sessionId: m.sessionId, itemId: "orientation-2", transcript: "Wednesday" })).structuredContent;
    expect(r.nextItem.itemId).toBe("give_words-3");
    r = (await call("record_answer", { sessionId: m.sessionId, itemId: "give_words-3", transcript: "okay" })).structuredContent;
    expect(r.done).toBe(true);
    const f = (await call("finish_checkin", { sessionId: m.sessionId })).structuredContent;
    expect(f.closingPhrasing).toMatch(/good morning/i);

    const mid = (await call("start_checkin", { participantId: "rose", slot: "midday" })).structuredContent;
    expect(mid.items.map((i: any) => i.type)).toEqual(["recall", "fluency", "consistency"]);
    expect(mid.participantFacts.yesterdayStory).toBeTruthy();
    expect(mid.items[2].suggestedPhrasing).toContain(mid.participantFacts.yesterdayStory);
    r = (await call("record_answer", { sessionId: mid.sessionId, itemId: "recall-1", transcript: `${words[0]} and ${words[2]}` })).structuredContent;
    expect(r.score).toBe(2); expect(r.feedbackPhrasing).toContain(words[1]);
    r = (await call("record_answer", { sessionId: mid.sessionId, itemId: "fluency-2", transcript: "" })).structuredContent;
    r = (await call("record_answer", { sessionId: mid.sessionId, itemId: "consistency-3", transcript: "Oh, I'm not sure." })).structuredContent;
    expect(r.done).toBe(true);
    await call("finish_checkin", { sessionId: mid.sessionId });

    const eve = (await call("start_checkin", { participantId: "rose", slot: "evening" })).structuredContent;
    await call("record_answer", { sessionId: eve.sessionId, itemId: "day_story-1", transcript: "I planted lavender by the porch and it smelled lovely." });
    await call("record_answer", { sessionId: eve.sessionId, itemId: "mood-2", transcript: "calm" });
    await call("finish_checkin", { sessionId: eve.sessionId });
    expect(repo.listSessions("rose").length).toBe(before + 3);
    expect(repo.listFacts("rose", "dayStory").at(-1)!.text).toContain("lavender");
  });
  it("safety: a fall sends phrasing without the s-word and an urgent outbox note", async () => {
    const before = repo.listOutbox().length;
    const r = (await call("report_concern", { participantId: "rose", transcript: "I fell and my face feels numb" })).structuredContent;
    expect(r.level).toBe("emergency");
    expect(r.participantPhrasing).toMatch(/call 911 now/);
    expect(r.participantPhrasing).toMatch(/Maya/);
    expect(JSON.stringify(r).toLowerCase()).not.toContain("stroke");
    expect(r.caregiverNotified).toBe(true);
    const out = repo.listOutbox();
    expect(out.length).toBe(before + 1); expect(out[0]!.subject).toMatch(/check on Rose now/); expect(out[0]!.body).toContain("I fell and my face feels numb");
  });
  it("get_trend: participant sees gentle words only, caregiver sees series", async () => {
    const p = (await call("get_trend", { participantId: "rose", audience: "participant" })).structuredContent;
    expect(["steady", "mixed", "talk-to-doctor"]).toContain(p.status);
    expect(JSON.stringify(p).toLowerCase()).not.toMatch(/declin|stroke/);
    const c = (await call("get_trend", { participantId: "rose", audience: "caregiver" })).structuredContent;
    expect(c.series.length).toBeGreaterThan(5); expect(c.alert).not.toBeNull();
  });
  it("doctor summary, ics visit, unknown participant is an error", async () => {
    const d = (await call("get_doctor_summary", { participantId: "rose" })).structuredContent;
    expect(d.identity.name).toBe("Rose Alvarez"); expect(d.notMeasured.length).toBeGreaterThan(2);
    const v = (await call("schedule_doctor_visit", { participantId: "rose", whenIso: "2026-10-23T10:00:00-07:00" })).structuredContent;
    expect(v.emailedTo).toEqual(["maya@example.com"]); expect(v.icsPath).toMatch(/\.ics$/);
    const e = await call("get_trend", { participantId: "nobody", audience: "participant" });
    expect(e.isError).toBe(true);
  });
  it("serves ui:// views as text/html;profile=mcp-app", async () => {
    for (const v of ["checkin-card", "trend-card", "doctor-summary", "study-dashboard", "consent-card"]) {
      const r = await rpc("resources/read", { uri: `ui://lantern/${v}` });
      const c = r.result.contents[0];
      expect(c.mimeType).toBe("text/html;profile=mcp-app");
      expect(c.text).toContain("<html");
      expect(c.text, v).not.toContain("not built yet");
    }
  });
  it("wordlists resource and consent template resolve", async () => {
    const r = await rpc("resources/read", { uri: "lantern://wordlists" });
    expect(JSON.parse(r.result.contents[0].text)).toHaveLength(40);
    const c = await rpc("resources/read", { uri: "lantern://consent/LANTERN-PILOT" });
    expect(c.result.contents[0].text).toContain("stop sharing");
    const p = await rpc("prompts/get", { name: "daily-checkin", arguments: { participantId: "rose" } });
    expect(p.result.messages[0].content.text).toContain("start_checkin");
  });
});
