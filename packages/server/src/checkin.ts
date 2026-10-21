/** Check-in engine: builds the items for a session and scores answers. Pure logic over the Repo. */
import { randomUUID } from "node:crypto";
import {
  CATEGORIES, WORD_TRIPLETS, addDays, getCategory, keywordJudge, languageFeatures, scoreFluency, scoreOrientation, scoreRecall, storyRepetition, tokenize,
  type Judge, type OrientFacet, type Participant, type Session, type Slot, type AcousticFeatures,
} from "@lantern/shared";
import { firstName, localDay, localHour, now, weekdayName } from "./clock.js";
import { orientTruth } from "./seed.js";
import { classify, concernPhrasing, emergencyPhrasing } from "./safety.js";
import { notifyCareCircle } from "./outbox.js";
import { refreshAlerts } from "./engine.js";
import { streakDays } from "./trend.js";
import type { Repo } from "./storage/repo.js";

export type ItemType = "context" | "orientation" | "give_words" | "recall" | "fluency" | "consistency" | "day_story" | "mood";
export interface Item { itemId: string; type: ItemType; prompt: string; stimuli?: Record<string, unknown>; suggestedPhrasing: string }
interface SessionState { slot: Slot; day: string; items: Item[]; words?: [string, string, string]; wordsGivenToday: boolean; category?: string; facets?: OrientFacet[]; yesterdayStory?: string; answered: string[] }

export const judge: { current: Judge } = { current: keywordJudge };

const stateKey = (id: string) => `sess:${id}`;
const load = (repo: Repo, id: string): SessionState | undefined => { const v = repo.getKv(stateKey(id)); return v ? (JSON.parse(v) as SessionState) : undefined; };
const save = (repo: Repo, id: string, s: SessionState) => repo.setKv(stateKey(id), JSON.stringify(s));

export function inferSlot(p: Participant): Slot {
  const h = localHour(p.tz);
  return h < 11 ? "morning" : h < 16 ? "midday" : "evening";
}

function pickTriplet(repo: Repo, p: Participant, day: string): number {
  const uses = repo.listWordlistUse(p.id);
  const burned = new Set(uses.filter((u) => u.usedOn >= addDays(day, -30)).map((u) => u.listId));
  const last = uses.at(-1);
  const start = last ? (last.listId + 1) % WORD_TRIPLETS.length : 0;
  for (let k = 0; k < WORD_TRIPLETS.length; k++) { const id = (start + k) % WORD_TRIPLETS.length; if (!burned.has(id)) return id; }
  return start;
}

const GREETING: Record<Slot, string> = { morning: "Good morning", midday: "Hi", evening: "Good evening" };

/** "My granddaughter called." -> "your granddaughter called." so Alexa can say it back. */
const secondPerson = (t: string) => t.trim().replace(/\bI'm\b/g, "you're").replace(/\b(My|my)\b/g, "your").replace(/\bI\b/g, "you");

export function startCheckin(repo: Repo, p: Participant, slotIn?: Slot) {
  const slot = slotIn ?? inferSlot(p);
  const day = localDay(p.tz);
  const first = firstName(p);
  const sessionId = randomUUID();
  const items: Item[] = [];
  const st: SessionState = { slot, day, items, wordsGivenToday: false, answered: [] };
  const todayUse = repo.listWordlistUse(p.id).find((u) => u.usedOn === day);
  const yesterday = repo.listFacts(p.id, "dayStory", addDays(day, -1)).filter((f) => f.date === addDays(day, -1)).at(-1);
  const g = `${GREETING[slot]}, ${first}.`;
  const lastFluency = repo.observationsForParticipant(p.id, "fluency").at(-1)?.itemId.replace("fluency-", "");
  const lastIdx = CATEGORIES.findIndex((c) => c.id === lastFluency);
  const cat = CATEGORIES[(lastIdx + 1) % CATEGORIES.length]!;
  const push = (it: Omit<Item, "itemId">) => items.push({ itemId: `${it.type}-${items.length + 1}`, ...it });

  if (slot === "morning") {
    push({ type: "context", prompt: "How did you sleep?", suggestedPhrasing: `${g} Did you sleep okay?` });
    st.facets = ["weekday"];
    push({ type: "orientation", prompt: "What day is it today?", stimuli: { facets: st.facets }, suggestedPhrasing: "What day is it today?" });
    if (!todayUse) {
      const listId = pickTriplet(repo, p, day);
      st.words = [...WORD_TRIPLETS[listId]!] as [string, string, string];
      repo.addWordlistUse({ participantId: p.id, listId, usedOn: day });
      st.wordsGivenToday = true;
      push({ type: "give_words", prompt: "Give three words to hold onto.", stimuli: { words: st.words, hideOnScreen: true }, suggestedPhrasing: `Three words for later: ${st.words.join(", ")}.` });
    }
  } else if (slot === "midday") {
    if (todayUse) {
      st.words = [...WORD_TRIPLETS[todayUse.listId]!] as [string, string, string];
      push({ type: "recall", prompt: "Which three words were you holding onto?", suggestedPhrasing: `${g} Which of the three words do you remember?` });
    } else {
      const listId = pickTriplet(repo, p, day);
      st.words = [...WORD_TRIPLETS[listId]!] as [string, string, string];
      repo.addWordlistUse({ participantId: p.id, listId, usedOn: day });
      st.wordsGivenToday = true;
      push({ type: "give_words", prompt: "Give three words to hold onto.", stimuli: { words: st.words, hideOnScreen: true }, suggestedPhrasing: `${g} Here are three words to hold onto: ${st.words.join(", ")}. Say them back to me in a minute.` });
      push({ type: "recall", prompt: "Which three words were you holding onto?", suggestedPhrasing: "Now, which three words were you holding onto?" });
    }
    st.category = cat.id;
    push({ type: "fluency", prompt: `Name as many ${cat.prompt} as you can.`, stimuli: { category: cat.id }, suggestedPhrasing: `Now name as many ${cat.prompt} as you can.` });
    if (yesterday) {
      st.yesterdayStory = yesterday.text;
      push({ type: "consistency", prompt: "Tell me about yesterday's story.", suggestedPhrasing: `Yesterday you said ${secondPerson(yesterday.text)} How did it go?` });
    }
  } else {
    push({ type: "day_story", prompt: "What was the best part of your day?", suggestedPhrasing: `${g} What was the best part of your day today?` });
    push({ type: "mood", prompt: "How are you feeling?", suggestedPhrasing: "How are you feeling tonight, in a word or two?" });
  }
  save(repo, sessionId, st);
  const session: Session = { id: sessionId, participantId: p.id, slot, startedAt: now().toISOString(), weight: 1, day };
  repo.addSession(session);
  return {
    sessionId, slot, items,
    participantFacts: { name: p.name, firstName: first, date: day, weekday: weekdayName(day), streakDays: streakDays(repo, p), ...(st.yesterdayStory ? { yesterdayStory: st.yesterdayStory } : {}) },
    tone: "Warm, short, one question at a time. Use plain words. Never say test, score, or wrong. Never show or read back the three words on screen.",
  };
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export function parseHours(t: string): number | undefined {
  const toks = tokenize(t);
  for (const w of toks) if (NUMBER_WORDS[w]) return NUMBER_WORDS[w];
  const m = t.match(/\b(\d{1,2})(\.\d)?\b/);
  return m ? Number(m[0]) : undefined;
}
const DISTRESS = /\b(sad|lonely|hopeless|down|blue|awful|terrible|depressed)\b/;
const ROUGH = /\b(rough|sick|ill|flu|cold|headache|stressed|stress|bad day|awful|terrible)\b/;

export async function recordAnswer(repo: Repo, p: Participant, a: { sessionId: string; itemId: string; transcript: string; acoustic?: AcousticFeatures }) {
  const st = load(repo, a.sessionId);
  const session = repo.getSession(a.sessionId);
  if (!st || !session) throw new Error("Unknown session. Start a check-in first.");
  const idx = st.items.findIndex((i) => i.itemId === a.itemId);
  if (idx < 0) throw new Error(`Unknown item ${a.itemId} for this session`);
  const item = st.items[idx]!;
  const t = a.transcript.trim();
  const obsId = () => randomUUID();
  const addObs = (domain: any, raw: string, score: number, features?: Record<string, number>, acoustic?: AcousticFeatures) =>
    repo.addObservation({ id: obsId(), sessionId: a.sessionId, domain, itemId: item.itemId, raw, score, features, acoustic });
  const careName = p.careCircle[0] ? p.careCircle[0].name.split(" ")[0] : undefined;

  // safety first
  const level = classify(t);
  if (level === "emergency") {
    notifyCareCircle(repo, p, "urgent", { quote: t });
    repo.updateSession(a.sessionId, { endedAt: now().toISOString() });
    return { score: 0, feedbackPhrasing: emergencyPhrasing(careName), done: true, emergency: true };
  }

  if (a.acoustic && suddenVoiceDrop(repo, p.id, a.acoustic)) {
    notifyCareCircle(repo, p, "urgent", { quote: "(Sudden, large change in how fast and how clearly the voice came through in one check-in. No words were said about it.)" });
    repo.updateSession(a.sessionId, { endedAt: now().toISOString() });
    return { score: 0, feedbackPhrasing: emergencyPhrasing(careName), done: true, emergency: true };
  }
  let score = 0;
  let feedback = "Thanks.";
  switch (item.type) {
    case "context": {
      const h = parseHours(t);
      const rough = ROUGH.test(t.toLowerCase());
      const ctx = { ...(session.context ?? {}), ...(h != null ? { sleepHours: h } : {}), ...(rough ? { roughDay: true } : {}) };
      const weight = (h != null && h < 5) || rough ? 0.5 : session.weight;
      repo.updateSession(a.sessionId, { context: ctx, weight });
      feedback = h != null ? `${h === 1 ? "One hour" : `${NUMBER_TEXT(h)} hours`}.` : "Thanks for telling me.";
      break;
    }
    case "orientation": {
      const truth = orientTruth(st.day);
      const facets = (item.stimuli?.facets as OrientFacet[]) ?? ["weekday"];
      const r = scoreOrientation(truth as any, t, facets);
      score = Math.round((r.correct.length / facets.length) * 3 * 100) / 100;
      addObs("orientation", t, score);
      feedback = "Thanks.";
      break;
    }
    case "give_words": feedback = "Got it."; break;
    case "recall": {
      const r = scoreRecall(st.words!, t);
      score = r.score;
      addObs("recall", t, score, { free: r.free });
      const miss = r.missed;
      feedback = r.free === 3 ? "All three. Nice!" : r.free === 0 ? `No worries. They were ${st.words!.join(", ")}. Let's keep going.` : `${NUM[r.free]} of three. The other ${miss.length > 1 ? "words were" : "was"} ${miss.join(" and ")}.`;
      break;
    }
    case "fluency": {
      const cat = getCategory(st.category!);
      const r = scoreFluency(cat.id, t);
      score = r.distinct;
      repo.addObservation({ id: obsId(), sessionId: a.sessionId, domain: "fluency", itemId: `fluency-${cat.id}`, raw: t, score, features: { repetitions: r.repetitions, intrusions: r.intrusions }, acoustic: a.acoustic });
      feedback = score === 0 ? "That's okay. Those can be tricky." : `${NUMBER_TEXT(score)}. Nice!`;
      break;
    }
    case "consistency": {
      score = await judge.current.consistency(st.yesterdayStory ?? "", t);
      addObs("consistency", t, score);
      feedback = score === 2 ? "That's great." : score === 1 ? "Thanks for telling me." : "That's okay. It's hard to hold on to every day.";
      break;
    }
    case "day_story": {
      const prior = repo.listFacts(p.id, "dayStory", addDays(st.day, -14)).map((f) => f.text);
      const lf = languageFeatures(t);
      addObs("repetition", t, storyRepetition(t, prior), { wordCount: lf.wordCount });
      addObs("fillers", t, lf.fillers, { ttr: lf.ttr, selfCorrections: lf.selfCorrections, meanSentenceLen: lf.meanSentenceLen });
      repo.addFact({ participantId: p.id, date: st.day, kind: "dayStory", text: t });
      feedback = "Thank you for sharing that.";
      break;
    }
    case "mood": {
      const ctx = { ...(session.context ?? {}), mood: t.slice(0, 40) };
      repo.updateSession(a.sessionId, { context: ctx });
      if (DISTRESS.test(t.toLowerCase())) {
        const prev = repo.listSessions(p.id, addDays(st.day, -1)).find((s) => s.day === addDays(st.day, -1) && s.context?.mood && DISTRESS.test(s.context.mood.toLowerCase()));
        if (prev) notifyCareCircle(repo, p, "custom", { subject: `${firstName(p)} has seemed low two days in a row`, message: `${firstName(p)} has said she feels low two evenings in a row. A call might help.` });
        feedback = "I'm sorry to hear that. I'm glad you told me.";
      } else feedback = `Thanks, ${firstName(p)}.`;
      break;
    }
  }
  if (a.acoustic) {
    addObs("f0Iqr", "", a.acoustic.f0Iqr, undefined, a.acoustic);
    addObs("wordsPerSec", "", a.acoustic.wordsPerSec, undefined, a.acoustic);
  }
  st.answered.push(item.itemId);
  save(repo, a.sessionId, st);
  const nextItem = st.items[idx + 1];
  return { score, feedbackPhrasing: feedback, ...(nextItem ? { nextItem } : {}), done: !nextItem };
}

/** Sudden single-session drop in speaking rate AND syllable rate (z <= -3 against the person's own history) goes to the safety path, not the drift path. */
export function suddenVoiceDrop(repo: Repo, participantId: string, ac: AcousticFeatures): boolean {
  const hist = repo.observationsForParticipant(participantId, "fluency").map((o) => o.acoustic).filter((x): x is AcousticFeatures => !!x);
  if (hist.length < 14) return false;
  const z = (vals: number[], x: number) => { const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1)) || 1e-6; return (x - m) / Math.max(sd, 0.05 * m); };
  return z(hist.map((h) => h.wordsPerSec), ac.wordsPerSec) <= -3 && z(hist.map((h) => h.syllRate), ac.syllRate) <= -3;
}

const NUM = ["Zero", "One", "Two", "Three"];
function NUMBER_TEXT(n: number): string { const w = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]; return n <= 12 && Number.isInteger(n) ? w[n]!.replace(/^./, (c) => c.toUpperCase()) : String(n); }

export function finishCheckin(repo: Repo, p: Participant, sessionId: string) {
  const session = repo.getSession(sessionId);
  const st = load(repo, sessionId);
  if (!session || !st) throw new Error("Unknown session");
  if (!session.endedAt) repo.updateSession(sessionId, { endedAt: now().toISOString() });
  const { result, opened } = refreshAlerts(repo, p.id, st.day);
  if (opened) {
    const r = notifyCareCircle(repo, p, "notice");
    repo.updateAlert(opened.id, { notifiedAt: now().toISOString() });
    void r;
  }
  const streak = streakDays(repo, p);
  const closing: Record<Slot, string> = { morning: "Have a good morning.", midday: "That's all for now. Enjoy your day.", evening: "Sleep well tonight." };
  const done = st.answered.length;
  void result;
  return { summary: { slot: st.slot, itemsDone: done, day: st.day }, streakDays: streak, closingPhrasing: `${closing[st.slot]}${streak >= 3 ? ` That's ${streak} days in a row.` : ""}`, alertsEvaluated: true };
}
