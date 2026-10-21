import { CATEGORIES, categoryDict } from "./categories.js";
import { STOPWORDS, fuzzyEqual, normWord, singular, tokenize } from "./text.js";

/* ---------- Delayed recall ---------- */
export interface RecallScore { free: number; cued: number; score: number; recalled: string[]; missed: string[] }

function containsWord(tokens: string[], target: string): boolean {
  const t = normWord(target);
  return tokens.some((tok) => { const n = normWord(tok); return n === t || fuzzyEqual(n, t); });
}

/** Free recall 0-3. `cuedTranscript` is the answer after a category hint; each newly recalled word adds 0.5. */
export function scoreRecall(given: readonly string[], transcript: string, cuedTranscript = ""): RecallScore {
  const tokens = tokenize(transcript);
  const recalled = given.filter((w) => containsWord(tokens, w));
  const missed = given.filter((w) => !recalled.includes(w));
  const cuedTokens = tokenize(cuedTranscript);
  const cuedHits = missed.filter((w) => containsWord(cuedTokens, w)).length;
  const free = recalled.length, cued = cuedHits * 0.5;
  return { free, cued, score: free + cued, recalled, missed };
}

/* ---------- Category fluency ---------- */
export interface FluencyScore { distinct: number; repetitions: number; intrusions: number; valid: string[]; intrusionWords: string[] }

function matchPhrases(tokens: string[], dict: Map<string, string>): { hits: string[]; used: boolean[] } {
  const norm = tokens.map(normWord);
  const used = new Array<boolean>(tokens.length).fill(false);
  const hits: string[] = [];
  for (let i = 0; i < norm.length; i++) {
    if (used[i]) continue;
    let matched = false;
    for (const len of [3, 2]) { // multi-word members first
      if (i + len > norm.length) continue;
      const phrase = norm.slice(i, i + len).join(" ");
      if (dict.has(phrase)) { hits.push(phrase); for (let k = 0; k < len; k++) used[i + k] = true; matched = true; break; }
    }
    if (matched) continue;
    const w = norm[i]!;
    if (STOPWORDS.has(tokens[i]!)) continue;
    if (dict.has(w)) { hits.push(w); used[i] = true; continue; }
    for (const key of dict.keys()) { // spelling slips
      if (!key.includes(" ") && fuzzyEqual(w, key)) { hits.push(key); used[i] = true; break; }
    }
  }
  return { hits, used };
}

export function scoreFluency(categoryId: string, transcript: string): FluencyScore {
  const dict = categoryDict(categoryId);
  const tokens = tokenize(transcript);
  const { hits, used } = matchPhrases(tokens, dict);
  const seen = new Set<string>();
  let repetitions = 0;
  for (const h of hits) { if (seen.has(h)) repetitions++; else seen.add(h); }
  // intrusion = a clear item from some other category
  const intrusionWords: string[] = [];
  for (const cat of CATEGORIES) {
    if (cat.id === categoryId) continue;
    const other = categoryDict(cat.id);
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      const w = normWord(tokens[i]!);
      if (other.has(w) && !dict.has(w) && !intrusionWords.includes(w) && !STOPWORDS.has(tokens[i]!)) intrusionWords.push(w);
    }
  }
  return { distinct: seen.size, repetitions, intrusions: intrusionWords.length, valid: [...seen], intrusionWords };
}

/* ---------- Orientation ---------- */
export type OrientFacet = "weekday" | "month" | "season";
export interface OrientTruth { weekday: string; month: string; season: "winter" | "spring" | "summer" | "fall" }
export interface OrientScore { score: number; correct: OrientFacet[]; asked: OrientFacet[] }

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const ABBREV: Record<string, string[]> = { tuesday: ["tues"], thursday: ["thur", "thurs"], september: ["sept"] };
function nameHit(tokens: string[], full: string): boolean {
  const alts = ABBREV[full] ?? [];
  return tokens.some((t) => t === full || alts.includes(t));
}

export function scoreOrientation(truth: OrientTruth, transcript: string, asked: OrientFacet[] = ["weekday", "month", "season"]): OrientScore {
  const tokens = tokenize(transcript);
  const correct: OrientFacet[] = [];
  for (const f of asked) {
    if (f === "weekday") {
      const said = WEEKDAYS.filter((d) => nameHit(tokens, d));
      if (said.length === 1 && said[0] === truth.weekday.toLowerCase()) correct.push(f);
    } else if (f === "month") {
      const said = MONTHS.filter((m) => nameHit(tokens, m));
      if (said.length === 1 && said[0] === truth.month.toLowerCase()) correct.push(f);
    } else {
      const seasons = ["winter", "spring", "summer", "fall"].filter((s) => tokens.includes(s) || (s === "fall" && tokens.includes("autumn")));
      if (seasons.length === 1 && seasons[0] === truth.season) correct.push(f);
    }
  }
  return { score: correct.length, correct, asked };
}

/* ---------- Autobiographical consistency ---------- */
export interface Judge { consistency(prior: string, now: string): Promise<0 | 1 | 2> | 0 | 1 | 2 }

export function contentStems(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 2).map((t) => stem(singular(t)));
}
function stem(w: string): string { return w.replace(/(ing|ed|ly)$/, "").replace(/(.)\1$/, "$1") || w; }

const DENIAL = /\b(don'?t remember|do not remember|can'?t remember|cannot remember|don'?t recall|no idea|can'?t recall|forgot|forget|nothing happened|not sure what you mean|what are you talking about)\b/;

/** 0 none / 1 partial / 2 consistent. Keyword-overlap fallback; an LLM Judge can replace it. */
export function scoreConsistency(prior: string, now: string): 0 | 1 | 2 {
  const priorStems = new Set(contentStems(prior));
  const nowTokens = tokenize(now);
  const nowStems = new Set(contentStems(now));
  if (nowTokens.length < 2) return 0;
  const overlap = [...priorStems].filter((s) => nowStems.has(s)).length;
  const ratio = priorStems.size ? overlap / priorStems.size : 0;
  const denies = DENIAL.test(now.toLowerCase());
  if (denies && ratio < 0.4) return 0;
  if (ratio >= 0.4 || overlap >= 3) return 2;
  if (overlap >= 1 || nowTokens.length >= 3) return 1; // on-topic answer without echoed details
  return 0;
}
export const keywordJudge: Judge = { consistency: (p, n) => scoreConsistency(p, n) };

/* ---------- Story repetition ---------- */
function tf(stems: string[]): Map<string, number> { const m = new Map<string, number>(); for (const s of stems) m.set(s, (m.get(s) ?? 0) + 1); return m; }
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** 0-1: highest similarity between today's story and any prior story. */
export function storyRepetition(today: string, priorStories: string[]): number {
  const t = tf(contentStems(today));
  let best = 0;
  for (const p of priorStories) best = Math.max(best, cosine(t, tf(contentStems(p))));
  return Math.round(best * 1000) / 1000;
}

/* ---------- Language features ---------- */
export const FILLERS = ["thing", "things", "stuff", "whatchamacallit", "whatsit", "thingy", "thingamajig", "um", "uh", "er", "erm", "hmm"];
const FILLER_PHRASES = ["you know"];
const CORRECTION_PHRASES = ["i mean", "no wait", "wait no", "let me start over", "sorry", "or rather", "no no"];

export interface LanguageFeatures { wordCount: number; ttr: number; fillers: number; selfCorrections: number; meanSentenceLen: number }

export function languageFeatures(transcript: string): LanguageFeatures {
  const tokens = tokenize(transcript);
  const lower = " " + tokens.join(" ") + " ";
  const wordCount = tokens.length;
  const ttr = wordCount ? new Set(tokens).size / wordCount : 0;
  let fillers = tokens.filter((t) => FILLERS.includes(t)).length;
  for (const p of FILLER_PHRASES) fillers += lower.split(" " + p + " ").length - 1;
  let selfCorrections = 0;
  for (const p of CORRECTION_PHRASES) selfCorrections += lower.split(" " + p + " ").length - 1;
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1] && tokens[i]!.length > 1 && !["very", "had", "that"].includes(tokens[i]!)) selfCorrections++;
  const sentences = transcript.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length || (wordCount ? 1 : 0);
  return { wordCount, ttr: Math.round(ttr * 1000) / 1000, fillers, selfCorrections, meanSentenceLen: sentences ? Math.round((wordCount / sentences) * 100) / 100 : 0 };
}
