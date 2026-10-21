/** De-identification helpers (HIPAA Safe Harbor style, simple and conservative). */
import { createHmac, randomBytes } from "node:crypto";
import { CATEGORIES, addDays, normPhrase, type Participant } from "@lantern/shared";
import type { Repo } from "./storage/repo.js";

export function studySecret(repo: Repo, studyCode: string): string {
  if (process.env.LANTERN_STUDY_SECRET) return process.env.LANTERN_STUDY_SECRET + studyCode;
  const k = `secret:${studyCode}`;
  let s = repo.getKv(k);
  if (!s) { s = randomBytes(24).toString("hex"); repo.setKv(k, s); }
  return s;
}
export const pseudonym = (secret: string, id: string) => "P-" + createHmac("sha256", secret).update(id).digest("hex").slice(0, 10).toUpperCase();
export const shiftDate = (day: string, p: Participant) => addDays(day, p.dateShiftDays);
export const ageBucket = (birthYear: number, year: number) => { const a = year - birthYear; return a > 89 ? "90+" : String(a); };

const PLACES = new Set(["ohio", "maine", "seattle", "tucson", "arizona", "phoenix", "washington", "california", "texas", "florida"]);
for (const c of CATEGORIES.filter((c) => c.id === "cities")) for (const m of c.members) PLACES.add(m.toLowerCase());
const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(\s+\d{1,2}(st|nd|rd|th)?)?/gi;

/** Names from the database, places, emails, phones, dates and any capitalized word in mid-sentence. */
export function scrubTranscript(text: string, knownNames: string[]): string {
  let t = text;
  for (const n of knownNames) if (n.length > 1) t = t.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "[NAME]");
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]").replace(/\+?\d[\d\s().-]{8,}\d/g, "[PHONE]");
  t = t.replace(MONTHS, "[DATE]").replace(/\b(19|20)\d{2}\b/g, "[YEAR]");
  // capitalized words that are not at the start of a sentence (names, places)
  t = t.replace(/([a-z,;:])(\s+)([A-Z][a-z]+)/g, (m, a, sp, w) => (w === "I" ? m : `${a}${sp}[NAME]`));
  // known places even when lower-case at sentence start
  t = t.replace(/\b[A-Za-z]+\b/g, (w) => (PLACES.has(w.toLowerCase()) && /^[A-Z]/.test(w) ? "[PLACE]" : w));
  return t;
}

export function knownNames(repo: Repo): string[] {
  const out = new Set<string>();
  for (const p of repo.listParticipants()) {
    for (const part of p.name.split(" ")) out.add(part);
    for (const c of p.careCircle) for (const part of c.name.split(" ")) out.add(part);
  }
  return [...out];
}
void normPhrase;
