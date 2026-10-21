import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PRODUCT, WORD_TRIPLETS, type Participant } from "@lantern/shared";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../storage/repo.js";
import { finishCheckin, recordAnswer, startCheckin } from "../checkin.js";
import { classify, concernPhrasing, emergencyPhrasing } from "../safety.js";
import { OUTBOX_DIR, buildIcs, enqueueEmail, esc, notifyCareCircle, wrapEmail } from "../outbox.js";
import { getDoctorSummary, getTrend } from "../trend.js";
import { consentSummary, recordConsent, studyDashboard, withdraw } from "../research.js";
import { exportResearchData } from "../export.js";
import { firstName, now } from "../clock.js";

/** ui:// resources. The HTML for each is registered in views.ts. */
export const UI = {
  checkin: "ui://lantern/checkin-card",
  trend: "ui://lantern/trend-card",
  doctor: "ui://lantern/doctor-summary",
  dashboard: "ui://lantern/study-dashboard",
  consent: "ui://lantern/consent-card",
} as const;
const uiMeta = (resourceUri: string, invoking: string, invoked: string) => ({ ui: { resourceUri, invoking, invoked } });

type Out = Record<string, unknown>;
const ok = (data: Out, meta?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, ...(meta ? { _meta: meta } : {}) });
const fail = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });
const obj = (shape: z.ZodRawShape) => z.object(shape).passthrough();

function resolve(repo: Repo, idOrName: string): Participant | undefined {
  const direct = repo.getParticipant(idOrName);
  if (direct) return direct;
  const q = idOrName.trim().toLowerCase();
  return repo.listParticipants().find((p) => p.name.toLowerCase() === q || p.name.split(" ")[0]!.toLowerCase() === q);
}

const pid = z.string().describe("The participant's id, or their first name (for example \"rose\").");
const slotEnum = z.enum(["morning", "midday", "evening"]);

export const TOOL_NAMES = ["start_checkin", "record_answer", "finish_checkin", "get_trend", "get_doctor_summary", "notify_care_circle", "schedule_doctor_visit", "report_concern", "enroll_in_study", "record_consent", "withdraw_from_study", "export_research_data", "get_study_dashboard"] as const;

export function createMcpServer(repo: Repo): McpServer {
  const server = new McpServer({ name: PRODUCT.slug, version: "0.1.0" }, {
    instructions: `${PRODUCT.name} runs short, friendly memory and speech check-ins. Use the daily-checkin prompt or the lantern-checkin skill. Ask one question at a time. Never show or read back the three words on screen. ${PRODUCT.disclaimer}`,
  });

  const withP = async (id: string, fn: (p: Participant) => Promise<ReturnType<typeof ok>> | ReturnType<typeof ok>) => {
    const p = resolve(repo, id);
    if (!p) return fail(`I could not find a participant called "${id}".`);
    try { return await fn(p); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  };

  server.registerTool("start_checkin", {
    title: "Start a check-in",
    description: "Use when the person says good morning, asks to check in, or it is time for a short memory-and-speech moment. Starts one 45-second conversation (morning, midday, or evening; inferred from local time if omitted) and returns the ordered questions with suggested wording, plus facts like yesterday's story. Ask them one at a time, call record_answer after each reply, then finish_checkin.",
    inputSchema: { participantId: pid, slot: slotEnum.optional().describe("morning, midday, or evening. Leave out to use local time.") },
    outputSchema: obj({ sessionId: z.string(), slot: slotEnum, items: z.array(z.object({ itemId: z.string(), type: z.string(), prompt: z.string(), suggestedPhrasing: z.string() }).passthrough()), participantFacts: z.object({ name: z.string() }).passthrough(), tone: z.string() }),
    _meta: uiMeta(UI.checkin, "Checking in…", "Here's your check-in"),
  }, (a) => withP(a.participantId, (p) => ok(startCheckin(repo, p, a.slot), uiMeta(UI.checkin, "Checking in…", "Here's your check-in"))));

  server.registerTool("record_answer", {
    title: "Record an answer",
    description: "Use after the person answers one check-in question. Pass what they said as the transcript. Scores it quietly, saves it, and returns kind wording to say back (feedbackPhrasing) and the next question if there is one. Never tell the person a score.",
    inputSchema: {
      sessionId: z.string(), itemId: z.string(), transcript: z.string().describe("The person's words, as heard."),
      clientTimings: z.object({ startMs: z.number(), endMs: z.number() }).optional(),
      acoustic: z.object({ rmsDb: z.number(), f0Median: z.number(), f0Iqr: z.number(), wordsPerSec: z.number(), pauseRatio: z.number(), syllRate: z.number() }).optional().describe("Optional voice numbers from a device that can measure them. Experimental."),
    },
    outputSchema: obj({ score: z.number(), feedbackPhrasing: z.string(), done: z.boolean(), nextItem: z.object({ itemId: z.string() }).passthrough().optional() }),
  }, async (a) => {
    const s = repo.getSession(a.sessionId);
    if (!s) return fail("Unknown session. Call start_checkin first.");
    return withP(s.participantId, async (p) => ok(await recordAnswer(repo, p, a) as Out));
  });

  server.registerTool("finish_checkin", {
    title: "Finish a check-in",
    description: "Use when the last question is answered, or when the person wants to stop. Closes the check-in, updates their personal baseline and trend, and returns a short closing line and their streak. Safe to call early with whatever was answered.",
    inputSchema: { sessionId: z.string() },
    outputSchema: obj({ summary: z.object({}).passthrough(), streakDays: z.number(), closingPhrasing: z.string(), alertsEvaluated: z.boolean() }),
  }, async (a) => {
    const s = repo.getSession(a.sessionId);
    if (!s) return fail("Unknown session.");
    return withP(s.participantId, (p) => ok(finishCheckin(repo, p, a.sessionId) as Out));
  });

  server.registerTool("get_trend", {
    title: "Show the trend",
    description: "Use when someone asks how they (or a family member) are doing. audience=participant returns only a gentle word (steady, mixed). audience=caregiver or clinician returns the full series, baseline, flags, and adherence, and shows a trend card.",
    inputSchema: { participantId: pid, audience: z.enum(["participant", "caregiver", "clinician"]), days: z.number().int().min(7).max(365).optional().describe("Days of history. Default 90.") },
    outputSchema: obj({ audience: z.string() }),
    _meta: uiMeta(UI.trend, "Getting the trend…", "Here's the trend"),
  }, (a) => withP(a.participantId, (p) => ok(getTrend(repo, p, a.audience, a.days ?? 90) as Out, uiMeta(UI.trend, "Getting the trend…", "Here's the trend"))));

  server.registerTool("get_doctor_summary", {
    title: "Doctor summary",
    description: "Use when a family member or the person asks for something to bring to the doctor. Returns a one-page summary: 90-day charts against the personal baseline, change table, sleep, adherence, and what Lantern does not measure. Shown full screen.",
    inputSchema: { participantId: pid },
    outputSchema: obj({ identity: z.object({}).passthrough(), notMeasured: z.array(z.string()), disclaimer: z.string() }),
    _meta: uiMeta(UI.doctor, "Preparing the summary…", "Here's the doctor summary"),
  }, (a) => withP(a.participantId, (p) => ok(getDoctorSummary(repo, p) as Out, uiMeta(UI.doctor, "Preparing the summary…", "Here's the doctor summary"))));

  server.registerTool("notify_care_circle", {
    title: "Tell the care circle",
    description: "Use to send the family a note: a weekly digest, a gentle notice, an urgent message, or a custom message. Writes to the local outbox (no real email is sent). Returns where it went and a preview of the text.",
    inputSchema: { participantId: pid, kind: z.enum(["digest", "notice", "urgent", "custom"]), message: z.string().optional() },
    outputSchema: obj({ delivered: z.array(z.string()), previewText: z.string() }),
  }, (a) => withP(a.participantId, (p) => ok(notifyCareCircle(repo, p, a.kind, { message: a.message }) as Out)));

  server.registerTool("schedule_doctor_visit", {
    title: "Add a doctor visit",
    description: "Use after the family agrees to book a check-up. Creates a calendar file (.ics) for the visit and puts a note with it in the care circle's outbox. whenIso is an ISO 8601 date and time.",
    inputSchema: { participantId: pid, whenIso: z.string().describe("ISO 8601 date-time, for example 2026-10-23T10:00:00-07:00"), withWhom: z.string().optional() },
    outputSchema: obj({ icsPath: z.string(), emailedTo: z.array(z.string()) }),
  }, (a) => withP(a.participantId, (p) => {
    if (Number.isNaN(Date.parse(a.whenIso))) return fail("That date and time did not look right. Try again with a date like 2026-10-23T10:00:00-07:00.") as any;
    const first = firstName(p);
    const uid = randomUUID();
    const ics = buildIcs({ uid, startIso: a.whenIso, summary: `Check-up for ${p.name}${a.withWhom ? ` with ${a.withWhom}` : ""}`, description: `Bring the ${PRODUCT.name} doctor summary. ${PRODUCT.disclaimer}` });
    mkdirSync(OUTBOX_DIR, { recursive: true });
    const icsPath = join(OUTBOX_DIR, `visit-${uid.slice(0, 8)}.ics`);
    writeFileSync(icsPath, ics);
    const when = new Date(a.whenIso).toLocaleString("en-US", { timeZone: p.tz, dateStyle: "full", timeStyle: "short" });
    const html = wrapEmail(`Visit added for ${first}`, `<h1 style="font-size:26px;margin:0 0 12px">A visit is on the calendar</h1><p style="font-size:18px;line-height:1.5">${esc(first)} has a check-up on ${esc(when)}${a.withWhom ? ` with ${esc(a.withWhom)}` : ""}. The calendar file is attached (${esc(icsPath)}). Please bring the ${PRODUCT.name} doctor summary.</p>`);
    const sent = p.careCircle.map((c) => enqueueEmail(repo, { to: c.email, subject: `Visit added for ${first}`, html, kind: "visit", attachments: [{ name: `visit-${uid.slice(0, 8)}-copy.ics`, content: ics }] }));
    return ok({ icsPath, emailedTo: sent.map((s) => s.to), when });
  }));

  server.registerTool("report_concern", {
    title: "Report a concern",
    description: "Use whenever the person says anything that could mean they need help: a fall, numbness, a drooping face, weak arm, trouble speaking, sudden confusion, or feeling very low. Returns the exact words to say. If it may be an emergency it also tells the family right away.",
    inputSchema: { participantId: pid, transcript: z.string().describe("What the person said.") },
    outputSchema: obj({ level: z.enum(["emergency", "concern", "none"]), participantPhrasing: z.string(), caregiverNotified: z.boolean() }),
  }, (a) => withP(a.participantId, (p) => {
    const level = classify(a.transcript);
    const care = p.careCircle[0]?.name.split(" ")[0];
    if (level === "emergency") { notifyCareCircle(repo, p, "urgent", { quote: a.transcript }); return ok({ level, participantPhrasing: emergencyPhrasing(care), caregiverNotified: true }); }
    if (level === "concern") return ok({ level, participantPhrasing: concernPhrasing(), caregiverNotified: false });
    return ok({ level, participantPhrasing: "", caregiverNotified: false });
  }));

  server.registerTool("enroll_in_study", {
    title: "Join a study",
    description: "Use when the person or family gives a study code. Returns the consent information in plain words to read aloud and show. Nobody is enrolled until record_consent is called.",
    inputSchema: { participantId: pid, studyCode: z.string() },
    outputSchema: obj({ consentSummary: z.string(), consentVersion: z.string() }),
    _meta: uiMeta(UI.consent, "Looking up the study…", "Here's the study"),
  }, (a) => withP(a.participantId, () => {
    const c = consentSummary(repo, a.studyCode);
    if (!c) return fail(`I could not find a study with the code ${a.studyCode}.`) as any;
    return ok({ study: c.study, consentSummary: c.consentText, consentVersion: c.consentVersion, tiers: c.tiers }, uiMeta(UI.consent, "Looking up the study…", "Here's the study"));
  }));

  server.registerTool("record_consent", {
    title: "Record consent",
    description: "Use after the person has heard the consent information and said yes. Saves their choice of tier (1 scores only, 2 scores and words with names removed), the study's consent version, and the time. proxyName is for a legal representative.",
    inputSchema: { participantId: pid, studyCode: z.string(), tier: z.union([z.literal(1), z.literal(2)]), assentTranscript: z.string(), proxyName: z.string().optional() },
    outputSchema: obj({ enrolled: z.boolean(), withdrawPhrase: z.string() }),
  }, (a) => withP(a.participantId, (p) => ok(recordConsent(repo, p, a.studyCode, a.tier, a.assentTranscript, a.proxyName) as Out)));

  server.registerTool("withdraw_from_study", {
    title: "Stop sharing data",
    description: "Use when the person says they want to stop sharing their data. Stops all future exports for that study right away.",
    inputSchema: { participantId: pid, studyCode: z.string() },
    outputSchema: obj({ withdrawn: z.boolean(), effective: z.string() }),
  }, (a) => withP(a.participantId, (p) => ok(withdraw(repo, p, a.studyCode) as Out)));

  server.registerTool("export_research_data", {
    title: "Export research data",
    description: "Use for a study team. Writes a de-identified export for a study (fhir or csv) and returns the file path, counts, and what was removed. Withdrawn participants are left out.",
    inputSchema: { studyCode: z.string(), format: z.enum(["fhir", "csv"]), since: z.string().optional().describe("Only data on or after this date (YYYY-MM-DD).") },
    outputSchema: obj({ path: z.string(), counts: z.object({}).passthrough(), deidentification: z.object({}).passthrough() }),
  }, (a) => { try { return ok(exportResearchData(repo, a.studyCode, a.format, a.since) as Out); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); } });

  server.registerTool("get_study_dashboard", {
    title: "Study dashboard",
    description: "Use for a study team to see the whole cohort: how many are enrolled, how often they check in, who is flagged, and a small trend line for each person (pseudonymous codes only). Shown full screen.",
    inputSchema: { studyCode: z.string() },
    outputSchema: obj({ enrolled: z.number(), flags: z.number() }),
    _meta: uiMeta(UI.dashboard, "Loading the study…", "Here's the study dashboard"),
  }, (a) => { try { return ok(studyDashboard(repo, a.studyCode) as Out, uiMeta(UI.dashboard, "Loading the study…", "Here's the study dashboard")); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); } });

  /* resources + prompt */
  server.registerResource("wordlists", "lantern://wordlists", { title: "Word triplets", description: "The 40 word triplets used for delayed recall. Do not read these to the person except as the check-in asks.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(WORD_TRIPLETS) }] }));
  server.registerResource("consent", new ResourceTemplate("lantern://consent/{studyCode}", { list: async () => ({ resources: repo.listStudies().map((s) => ({ uri: `lantern://consent/${s.studyCode}`, name: `Consent for ${s.studyCode}` })) }) }),
    { title: "Study consent text", description: "Plain-language consent text for a study.", mimeType: "text/plain" },
    async (uri, vars) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: repo.getStudy(String(vars.studyCode))?.consentText ?? "Unknown study." }] }));
  server.registerPrompt("daily-checkin", { title: "Daily check-in", description: "Run one short check-in for a participant.", argsSchema: { participantId: z.string() } },
    (a) => ({ messages: [{ role: "user", content: { type: "text", text: `Run a ${PRODUCT.name} check-in for ${a.participantId}. Call start_checkin, ask each item's suggestedPhrasing one question at a time, call record_answer after each reply, then finish_checkin. Be warm and brief. Never reveal the three words on screen. If they mention a fall, numbness, a drooping face, or trouble speaking, call report_concern and follow its wording.` } }] }));

  void now;
  return server;
}
