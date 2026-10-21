/** Deterministic synthetic data. Every person here is fictional. */
import {
  CATEGORIES, WORD_TRIPLETS, addDays, getCategory, languageFeatures, scoreConsistency, scoreFluency, scoreOrientation, scoreRecall, storyRepetition,
  type AcousticFeatures, type Mode, type Participant, type Slot,
} from "@lantern/shared";
import { randomUUID } from "node:crypto";
import { refreshAlerts, ALL_DOMAINS } from "./engine.js";
import { SEED_STUDIES } from "./studies.js";
import type { Repo } from "./storage/repo.js";

export const STORY_BANK: string[] = [
  "My granddaughter called about her science fair project on volcanoes.",
  "I helped at the church bake sale and we sold every lemon bar.",
  "I pulled weeds in the garden and found two ripe peppers.",
  "The neighbor's dog got out again and I walked him home.",
  "I made a pot of chili for Sunday supper.",
  "My sister phoned from Ohio and we talked about our old school.",
  "I finished a crossword puzzle at the kitchen table.",
  "The mailman brought a postcard from my cousin in Maine.",
  "I watched birds at the feeder, and a cardinal came by.",
  "I took a long walk by the wash after breakfast.",
  "A repairman fixed the leaky faucet in the hall bath.",
  "I baked banana bread and shared a loaf next door.",
  "I went to the library and picked up three mystery novels.",
  "My son sent photos from his camping trip to the lake.",
  "I sorted old photographs and found one of my first classroom.",
  "I got my hair trimmed and the stylist told a funny joke.",
  "We had a dust storm and I closed all the windows.",
  "I knitted half of a blue scarf for the winter drive.",
  "I played cards with the ladies from the senior center.",
  "The grocery store had peaches on sale so I bought a bag.",
  "I planted herbs in clay pots on the back patio.",
  "A hummingbird visited the red flowers by the fence.",
  "I watched an old movie about a train robbery.",
  "I called the pharmacy and picked up my refill.",
  "My friend Linda came for tea and we shared cookies.",
  "I washed the car and the sun dried it in minutes.",
  "I read a story to the kids at the school reading hour.",
  "I painted the porch chair a bright yellow.",
  "The power went out for an hour, so I read by candlelight.",
  "I cleaned the closet and gave six bags to the thrift shop.",
  "I learned a new song on the piano, slowly.",
  "We went to the farmers market and I bought honey.",
  "A parade went down the main road for the fall festival.",
  "I wrote three letters to old friends and mailed them.",
  "I fixed my grandson a grilled cheese after school.",
  "The yoga class was hard, but my back feels better.",
  "I watered the cactus and it has a new bud.",
  "I went to the doctor for a regular checkup and all was fine.",
  "I sat on the porch and watched the sunset turn pink.",
  "I made a list for the trip to see my daughter in Seattle.",
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rng = () => number;
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pick = <T,>(r: Rng, a: T[]) => a[Math.floor(r() * a.length)]!;

interface Profile {
  id: string; name: string; birthYear: number; city?: string; mode: Mode; slotP: number;
  driftStart?: number; driftEnd?: number; driftScale?: number;
  recoverStart?: number; lowStart?: boolean; careName: string; careEmail: string; relation: string; tier: 1 | 2;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function seasonOf(day: string): "winter" | "spring" | "summer" | "fall" {
  const m = Number(day.slice(5, 7));
  return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
}
export function orientTruth(day: string) {
  const d = new Date(day + "T12:00:00Z");
  return { weekday: WEEKDAYS[d.getUTCDay()]!, month: MONTHS[d.getUTCMonth()]!, season: seasonOf(day) };
}
/** Local clock time (America/Phoenix, UTC-7, no DST) to ISO UTC. */
function isoAt(day: string, hour: number, minute: number): string {
  const total = hour * 60 + minute + 7 * 60;
  const base = Date.parse(day + "T00:00:00Z") + total * 60000;
  return new Date(base).toISOString();
}

function fillerize(story: string, k: number, r: Rng): string {
  const words = story.split(" ");
  const bits = ["um", "uh", "the thing", "you know", "whatchamacallit", "that stuff"];
  for (let i = 0; i < k; i++) words.splice(Math.floor(r() * words.length), 0, pick(r, bits) + ",");
  return words.join(" ");
}
const FILLER_COUNT: Record<string, number> = { "um": 1, "uh": 1, "the thing": 1, "you know": 1, "whatchamacallit": 1, "that stuff": 1 };
void FILLER_COUNT;

function consistencyAnswer(score: 0 | 1 | 2, prior: string, r: Rng): string {
  if (score === 0) return pick(r, ["I don't remember that.", "Hmm. I can't recall."]);
  if (score === 1) return pick(r, ["Oh, it went fine, I think.", "That was nice, yes."]);
  return "Oh yes. " + prior.replace(/^I /, "I ").toLowerCase();
}

const DAYS = 90;

function genPerson(repo: Repo, prof: Profile, seed: number, lastDay: string): { days: string[] } {
  const r = mulberry32(seed);
  const firstDay = addDays(lastDay, -(DAYS - 1));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(firstDay, i));
  const person: Participant = {
    id: prof.id, name: prof.name, birthYear: prof.birthYear, tz: "America/Phoenix", city: prof.city,
    careCircle: [{ name: prof.careName, email: prof.careEmail, relation: prof.relation }], mode: prof.mode, baseline: {},
    createdAt: firstDay, dateShiftDays: -Math.floor(r() * 366), synthetic: true,
  };
  repo.upsertParticipant(person);
  repo.addFact; // (facts are added per evening below)
  const stories: string[] = [];
  const f0Base = 45;
  for (let i = 0; i < DAYS; i++) {
    const day = days[i]!;
    const dayNo = i + 1;
    const outlier = prof.id === "rose" && dayNo === 38;
    // drift fraction 0..1 for decline profiles, or recovery fraction
    let f = 0;
    if (prof.driftStart) f = Math.pow(clamp((dayNo - prof.driftStart + 1) / ((prof.driftEnd ?? 90) - prof.driftStart + 1), 0, 1), 0.7); // front-loaded ramp so the flag lands mid-drift
    let rec = 0;
    if (prof.recoverStart) rec = clamp((dayNo - prof.recoverStart + 1) / (90 - prof.recoverStart + 1), 0, 1);
    const sc = prof.driftScale ?? 1;
    const lerp = (a: number, b: number) => a + (b - a) * f * sc;
    const lowBase = prof.mode === "recovery";
    const recallMu = lowBase ? 1.7 + 0.9 * rec : lerp(2.6, 1.9);
    const fluencyMu = lowBase ? 8 + 3 * rec : lerp(11, 9.5);
    const consMu = lowBase ? 1.0 + 0.8 * rec : lerp(1.8, 1.1);
    const pRepeat = lerp(0.03, 0.5);
    const fillerMu = lerp(1.5, 4);
    const f0Mu = lerp(f0Base, 30);

    const present: Record<Slot, boolean> = { morning: r() < prof.slotP, midday: r() < prof.slotP, evening: r() < prof.slotP };
    if (outlier) present.morning = present.midday = present.evening = true;
    if (i === DAYS - 1 && prof.slotP > 0.5) present.evening = true; // so "yesterday you told me" always works on day 91
    const sleep = outlier ? 3.5 : clamp(7 + gauss(r) * 0.4, 6.2, 8);
    const rough = outlier;
    const weight = sleep < 5 || rough ? 0.5 : 1;
    const mk = (slot: Slot, h: number, m: number, ctx?: object) => {
      const id = randomUUID();
      const jitter = Math.round((r() - 0.5) * 120);
      repo.addSession({ id, participantId: prof.id, slot, startedAt: isoAt(day, h, 0 + m + jitter), endedAt: isoAt(day, h, m + jitter + 1), weight, day, context: ctx as any });
      return id;
    };
    let obsN = 0;
    const obs = (sessionId: string, domain: (typeof ALL_DOMAINS)[number], itemId: string, raw: string, score: number, extra?: { features?: Record<string, number>; acoustic?: AcousticFeatures }) =>
      repo.addObservation({ id: `${prof.id}-${dayNo}-${obsN++}`, sessionId, domain, itemId, raw, score, ...extra });
    const listId = i % WORD_TRIPLETS.length;
    const triplet = WORD_TRIPLETS[listId]!;

    if (present.morning) {
      const sid = mk("morning", 8, 30, { sleepHours: Math.round(sleep * 10) / 10, roughDay: rough });
      repo.addWordlistUse({ participantId: prof.id, listId, usedOn: day });
      const t = orientTruth(day);
      const missed = prof.mode !== "diagnosed" && r() < 0.02;
      const say = missed ? `It's ${t.weekday === "monday" ? "tuesday" : "monday"}, ${t.month}, ${t.season}` : `It's ${t.weekday}, ${t.month}, ${t.season}`;
      obs(sid, "orientation", "orient-3", say, scoreOrientation(t as any, say).score);
      const prior = stories.at(-1);
      if (prior) {
        const target = clamp(Math.round(consMu + gauss(r) * 0.45), 0, 2) as 0 | 1 | 2;
        const ans = consistencyAnswer(target, prior, r);
        obs(sid, "consistency", "autobio-1", ans, scoreConsistency(prior, ans));
      }
    }
    if (present.midday) {
      const sid = mk("midday", 13, 0);
      const k = outlier ? 1 : clamp(Math.round(recallMu + gauss(r) * 0.5), 0, 3);
      const said = triplet.slice(0, k).join(", ") || "I can't remember them.";
      obs(sid, "recall", "recall-3", said, scoreRecall(triplet, said).score);
      const cat = CATEGORIES[i % CATEGORIES.length]!;
      const singles = cat.members.filter((m) => !m.includes(" "));
      const n = outlier ? 6 : Math.max(0, Math.round(fluencyMu + gauss(r) * 2));
      const fluentSaid = singles.slice((i * 5) % 20, (i * 5) % 20 + n).join(", ");
      const fl = scoreFluency(cat.id, fluentSaid);
      const wps = clamp(2.6 + gauss(r) * 0.25, 1.6, 3.4);
      const ac: AcousticFeatures = {
        rmsDb: Math.round((-26 + gauss(r) * 2) * 10) / 10, f0Median: Math.round(190 + gauss(r) * 8), f0Iqr: Math.round((f0Mu + gauss(r) * 3.5) * 10) / 10,
        wordsPerSec: Math.round(wps * 100) / 100, pauseRatio: Math.round(clamp(0.22 + gauss(r) * 0.03, 0.05, 0.6) * 100) / 100, syllRate: Math.round((4.1 + gauss(r) * 0.25) * 100) / 100,
      };
      obs(sid, "fluency", `fluency-${cat.id}`, fluentSaid, fl.distinct, { features: { repetitions: fl.repetitions, intrusions: fl.intrusions }, acoustic: ac });
      obs(sid, "f0Iqr", "acoustic", "", ac.f0Iqr, { acoustic: ac });
      obs(sid, "wordsPerSec", "acoustic", "", ac.wordsPerSec, { acoustic: ac });
    }
    if (present.evening) {
      const sid = mk("evening", 19, 0, { mood: pick(r, ["good", "fine", "calm", "happy", "tired"]), roughDay: rough });
      let story = STORY_BANK[(i * 7 + 3) % STORY_BANK.length]!;
      const recent = stories.slice(-14);
      if (recent.length && r() < pRepeat) story = pick(r, recent);
      const k = Math.max(0, Math.round(fillerMu + gauss(r) * 0.8));
      const told = fillerize(story, k, r);
      const lf = languageFeatures(told);
      obs(sid, "repetition", "story-rep", told, storyRepetition(story, recent), { features: { wordCount: lf.wordCount } });
      obs(sid, "fillers", "language", told, lf.fillers, { features: { ttr: lf.ttr, selfCorrections: lf.selfCorrections, meanSentenceLen: lf.meanSentenceLen } });
      repo.addFact({ participantId: prof.id, date: day, kind: "dayStory", text: story });
      stories.push(story);
    }
  }
  return { days };
}

export interface SeedRow { id: string; name: string; mode: string; adherence: number; alertDay: number | null; finalStatus: string; sessions: number }
export const ROSE_ID = "rose";

export function seedDatabase(repo: Repo, today: string): SeedRow[] {
  repo.reset();
  const lastDay = addDays(today, -1);
  for (const s of SEED_STUDIES) repo.upsertStudy(s);
  repo.setKv("seededThrough", lastDay);

  const P = (id: string, name: string, by: number, extra: Partial<Profile> = {}): Profile => ({
    id, name, birthYear: by, mode: "atRisk", slotP: 0.88, careName: "Family Contact", careEmail: `${id}.family@example.com`, relation: "family", tier: 1, ...extra,
  });
  const cohort: Profile[] = [
    { id: ROSE_ID, name: "Rose Alvarez", birthYear: 1958, city: "Tucson", mode: "atRisk", slotP: 0.85, driftStart: 61, driftEnd: 90, driftScale: 1.4, careName: "Maya Alvarez", careEmail: "maya@example.com", relation: "daughter", tier: 2 },
    P("p-01", "Walter Kim", 1951), P("p-02", "Dolores Reed", 1954), P("p-03", "Frank Okafor", 1949), P("p-04", "Evelyn Hart", 1960, { tier: 2 }),
    P("p-05", "Carlos Mendes", 1956), P("p-06", "Ruth Abrams", 1953, { tier: 2 }), P("p-07", "Harold Nguyen", 1950),
    P("p-08", "Gloria Santos", 1957, { driftStart: 50, driftEnd: 90, driftScale: 1.1 }),
    P("p-09", "Leonard Fox", 1952, { driftStart: 58, driftEnd: 90, driftScale: 1.05, tier: 2 }),
    P("p-10", "Mabel Quinn", 1955, { mode: "recovery", recoverStart: 40 }),
    P("p-11", "Arthur Bell", 1948, { slotP: 0.12 }),
  ];
  const rows: SeedRow[] = [];
  cohort.forEach((prof, idx) => {
    const { days } = genPerson(repo, prof, 1000 + idx * 17, lastDay);
    let alertDay: number | null = null;
    for (let i = 13; i < days.length; i++) {
      const { opened } = refreshAlerts(repo, prof.id, days[i]!);
      if (opened && alertDay === null) alertDay = i + 1;
    }
    const final = refreshAlerts(repo, prof.id, lastDay).result;
    const sessions = repo.listSessions(prof.id).length;
    rows.push({ id: prof.id, name: prof.name, mode: repo.getParticipant(prof.id)!.mode, adherence: Math.round((sessions / (DAYS * 3)) * 100), alertDay, finalStatus: final.status, sessions });
    repo.upsertEnrollment({ participantId: prof.id, studyCode: "LANTERN-PILOT", tier: prof.tier, consentVersion: "1.0", consentedAt: addDays(lastDay, -DAYS) + "T10:00:00Z" });
  });
  return rows;
}
