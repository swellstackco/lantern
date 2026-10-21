import { classify } from "../safety.js";
import { localDay, now, weekdayName } from "../clock.js";
import type { Brain, BrainRequest, BrainResponse, BrainState, ToolCall } from "./types.js";

const STOP = /\b(stop|that'?s all|i'?m done|no more|never mind|cancel)\b/i;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "Friday 10 am" -> ISO in Phoenix time (UTC-7, no daylight saving). Defaults to 10:00 and the next such weekday. */
export function parseVisitTime(text: string, tz = "America/Phoenix"): string | undefined {
  const t = text.toLowerCase();
  const wd = WEEKDAYS.find((d) => t.includes(d));
  if (!wd) return undefined;
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  let h = m ? Number(m[1]) : 10; const min = m?.[2] ? Number(m[2]) : 0;
  const ap = m?.[3]?.[0];
  if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0;
  if (!ap && h < 7) h += 12;
  const today = localDay(tz);
  let d = today;
  for (let i = 1; i <= 7; i++) { d = new Date(Date.parse(today + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10); if (weekdayName(d).toLowerCase() === wd) break; }
  return `${d}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-07:00`;
}

const redact = (say: string, words?: string[]) => (words?.length && !process.env.LANTERN_SHOW_WORDS ? words.reduce((s, w) => s.replace(new RegExp(`\\b${w}\\b`, "gi"), "•••"), say) : say);
const reply = (state: BrainState, say?: string, toolCalls: ToolCall[] = [], hide?: string[]): BrainResponse => ({ state, say, display: say ? redact(say, hide) : undefined, toolCalls, provider: "mock" });

function onUser(s: BrainState, text: string): BrainResponse {
  const t = text.trim();
  const low = t.toLowerCase();
  const pid = s.participantId;
  if (s.mode === "checkin" && s.session) {
    if (STOP.test(low)) return reply({ ...s, pendingFeedback: "Okay, no problem." }, undefined, [{ name: "finish_checkin", arguments: { sessionId: s.session.sessionId } }]);
    const itemId = (s as any)._itemId as string | undefined;
    if (!itemId) return reply(s, "Sorry, I lost my place. Say good morning to start again.");
    const args: Record<string, unknown> = { sessionId: s.session.sessionId, itemId, transcript: t };
    return reply(s, undefined, [{ name: "record_answer", arguments: args }]);
  }
  if (classify(t) === "emergency") return reply(s, undefined, [{ name: "report_concern", arguments: { participantId: pid, transcript: t } }]);
  if (s.mode === "visit_offer") {
    if (/\b(no|not now|later|skip)\b/.test(low) && !WEEKDAYS.some((d) => low.includes(d))) return reply({ ...s, mode: "idle" }, "Okay. Just ask me any time.");
    const when = parseVisitTime(t);
    if (when) return reply({ ...s, mode: "idle" }, undefined, [{ name: "schedule_doctor_visit", arguments: { participantId: pid, whenIso: when } }]);
    if (/\b(yes|yeah|sure|please|okay|ok)\b/.test(low)) return reply(s, "Sure. What day and time would you like?");
  }
  if (/good (morning|afternoon|evening)|check.?in|let'?s start|start (my|the)|after lunch|tonight/.test(low)) {
    const slot = /good morning/.test(low) ? "morning" : /good afternoon|after lunch|midday/.test(low) ? "midday" : /good evening|tonight/.test(low) ? "evening" : undefined;
    return reply({ ...s, mode: "idle" }, undefined, [{ name: "start_checkin", arguments: { participantId: pid, ...(slot ? { slot } : {}) } }]);
  }
  if (/stop sharing|withdraw|leave the study/.test(low)) return reply(s, undefined, [{ name: "withdraw_from_study", arguments: { participantId: pid, studyCode: "LANTERN-PILOT" } }]);
  if (s.mode === "consent_offer" && s.studyCode) {
    if (/\b(no|not now|never mind)\b/.test(low)) return reply({ ...s, mode: "idle", studyCode: undefined }, "Okay. Nothing was shared. You can ask again any time.");
    if (/\b(yes|yeah|sure|join|agree|okay|ok|i do)\b/.test(low)) return reply({ ...s, mode: "idle", studyCode: undefined }, undefined, [{ name: "record_consent", arguments: { participantId: pid, studyCode: s.studyCode, tier: /word|tier 2|both/.test(low) ? 2 : 1, assentTranscript: t } }]);
  }
  if (/study code|join (a|the|lantern)|enroll|pilot study/.test(low)) {
    const code = (t.match(/\b([A-Z][A-Z0-9]+-[A-Z0-9]+)\b/i)?.[1] ?? "LANTERN-PILOT").toUpperCase();
    return reply(s, undefined, [{ name: "enroll_in_study", arguments: { participantId: pid, studyCode: code } }]);
  }
  if (/doctor summary|summary for (the|her) doctor|bring to the doctor/.test(low)) return reply(s, undefined, [{ name: "get_doctor_summary", arguments: { participantId: pid } }]);
  if (/clinician|voice (trend|view|chart)|pitch range/.test(low)) return reply(s, undefined, [{ name: "get_trend", arguments: { participantId: pid, audience: "clinician" } }]);
  if (/(send|email).*(digest|weekly)|weekly (note|digest)/.test(low)) return reply(s, undefined, [{ name: "notify_care_circle", arguments: { participantId: pid, kind: "digest" } }]);
  if (/(any )?updates? (for|on) maya|anything (new )?for maya/.test(low)) return reply({ ...s }, undefined, [{ name: "get_trend", arguments: { participantId: pid, audience: "caregiver" } }]);
  if (/(show|send).*(maya|family|trend)|trend for maya|show maya/.test(low)) return reply(s, undefined, [{ name: "get_trend", arguments: { participantId: pid, audience: "caregiver" } }]);
  if (/how am i doing|how'?m i doing|how are things/.test(low)) return reply(s, undefined, [{ name: "get_trend", arguments: { participantId: pid, audience: "participant" } }]);
  if (/study dashboard|show the study/.test(low)) return reply(s, undefined, [{ name: "get_study_dashboard", arguments: { studyCode: "LANTERN-PILOT" } }]);
  return reply(s, "I can do a quick check-in, tell you how you're doing, or show something for Maya. Try saying good morning.");
}

function onResult(s: BrainState, name: string, args: Record<string, any> | undefined, r: { structuredContent?: any; isError?: boolean; text?: string }): BrainResponse {
  if (r.isError) return reply({ ...s, mode: s.mode === "visit_offer" ? "idle" : s.mode }, `Hmm. ${r.text ?? "Something went wrong."} Let's try that again.`);
  const d = r.structuredContent ?? {};
  switch (name) {
    case "start_checkin": {
      const first = d.items[0];
      const st = { ...s, mode: "checkin" as const, session: { sessionId: d.sessionId, slot: d.slot }, hiddenWords: undefined, _itemId: first.itemId, _items: d.items } as any;
      return reply(st, first.suggestedPhrasing, [], first.stimuli?.words);
    }
    case "record_answer": {
      const st: any = { ...s };
      if (d.emergency) { st.mode = "idle"; st.session = undefined; return reply(st, d.feedbackPhrasing); }
      if (d.nextItem) {
        st._itemId = d.nextItem.itemId;
        const say = `${d.feedbackPhrasing} ${d.nextItem.suggestedPhrasing}`;
        return reply(st, say, [], d.nextItem.stimuli?.words);
      }
      st.pendingFeedback = d.feedbackPhrasing;
      return reply(st, undefined, [{ name: "finish_checkin", arguments: { sessionId: s.session!.sessionId } }]);
    }
    case "finish_checkin": {
      const st: any = { ...s, mode: "idle", session: undefined, pendingFeedback: undefined, _itemId: undefined };
      const say = `${s.pendingFeedback ? s.pendingFeedback + " " : ""}${d.closingPhrasing}`;
      return reply(st, say);
    }
    case "get_trend":
      if (d.audience === "participant") return reply(s, d.words);
      if (d.alert) return reply({ ...s, mode: "visit_offer" }, `Here's how ${d.participant.name.split(" ")[0]} is doing. ${d.sentence} It may be worth a check-up. Want me to add a doctor visit to the calendar?`);
      return reply(s, `Here's how ${d.participant.name.split(" ")[0]} is doing. ${d.sentence}`);
    case "notify_care_circle": return reply(s, `Okay. I put ${d.delivered.length ? "the note" : "a note"} in Maya's outbox. It says: ${d.previewText.slice(0, 120)}`);
    case "get_doctor_summary": return reply(s, `Here's the one-page summary for ${d.identity.name.split(" ")[0]}'s doctor. It's on the screen. You can print it from there.`);
    case "schedule_doctor_visit": return reply(s, `Done. I added the visit for ${d.when ?? "that time"} and sent the note to ${d.emailedTo.join(" and ")}.`);
    case "report_concern": return reply(s, d.participantPhrasing || "Okay. I'm here if you need me.");
    case "withdraw_from_study": return reply(s, "Okay. I've stopped sharing your data with the study. You can join again any time.");
    case "enroll_in_study": return reply({ ...s, mode: "consent_offer", studyCode: d.study.studyCode } as any, `Here's what the ${d.study.name} study is about. It's on the screen. You can stop any time. Would you like to join? Say yes to share your scores, or say yes with my words to share those too.`);
    case "record_consent": return reply(s, `You're signed up. ${d.withdrawPhrase}`);
    case "get_study_dashboard": return reply(s, `Here's the study. ${d.enrolled} people are enrolled and ${d.flags} have a gentle flag.`);
    default: return reply(s, "Okay.");
  }
}

export const mockBrain: Brain = {
  name: "mock",
  async step(req: BrainRequest): Promise<BrainResponse> {
    const s: BrainState = req.state ?? { participantId: "rose", mode: "idle" };
    void now;
    return req.event.type === "user" ? onUser(s, req.event.text) : onResult(s, req.event.name, req.event.args, req.event.result);
  },
};
