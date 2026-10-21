import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOMAIN_META, PRODUCT, type Domain } from "@lantern/shared";
import { ageBucket, knownNames, pseudonym, scrubTranscript, shiftDate, studySecret } from "./deid.js";
import { EXPORTS_PATH } from "./paths.js";
import type { Repo } from "./storage/repo.js";

export const CODE_SYSTEM = "http://lantern.dev/fhir/CodeSystem/measures";
/** Local codes only. No LOINC codes are claimed: the mapping table is a TODO for a terminologist. */
export const MEASURES: Record<Domain, { code: string; display: string; unit: string; concept: number }> = {
  recall: { code: "delayed-recall-3", display: "Delayed word recall (0-3)", unit: "words", concept: 9001 },
  fluency: { code: "category-fluency-count", display: "Category fluency, distinct items", unit: "items", concept: 9002 },
  orientation: { code: "orientation-3", display: "Orientation (0-3)", unit: "points", concept: 9003 },
  consistency: { code: "autobiographical-consistency", display: "Autobiographical consistency (0-2), exploratory", unit: "points", concept: 9004 },
  repetition: { code: "story-repetition-index", display: "Story repetition index (0-1), exploratory", unit: "index", concept: 9005 },
  fillers: { code: "filler-word-count", display: "Placeholder and filler words per response, exploratory", unit: "count", concept: 9006 },
  f0Iqr: { code: "voice-f0-iqr", display: "Voice pitch range (IQR), experimental", unit: "Hz", concept: 9007 },
  wordsPerSec: { code: "speaking-rate", display: "Speaking rate, experimental", unit: "words/s", concept: 9008 },
};
const NOTE_DOMAINS: Domain[] = ["repetition", "consistency"];

export const DEID_SUMMARY = {
  method: "Safe Harbor style, conservative",
  pseudonymousIds: "HMAC-SHA256 of the participant id with a per-study secret (first 10 hex chars)",
  dates: "Per-participant random shift of -365 to 0 days, consistent within a participant; original dates are not exported",
  ages: "Birth year only; ages over 89 are bucketed as 90+",
  geography: "No ZIP, city, or address fields",
  transcripts: "Included only for Tier 2 consent, with names, places, dates, emails, phone numbers removed",
  excluded: "Withdrawn participants, device identifiers, names",
};

export function exportResearchData(repo: Repo, studyCodeIn: string, format: "fhir" | "csv", since?: string) {
  const study = repo.getStudy(studyCodeIn);
  if (!study) throw new Error(`Unknown study code ${studyCodeIn}`);
  const all = repo.listEnrollments(study.studyCode);
  const enrolled = all.filter((e) => !e.withdrawnAt);
  const secret = studySecret(repo, study.studyCode);
  const names = knownNames(repo);
  const enabled = new Set<Domain>(study.domainsEnabled);
  const year = new Date().getFullYear();

  const rows: { person: string; date: string; domain: Domain; value: number; slot: string; weight: number; tier: number; note: string; sleep?: number; id: string }[] = [];
  const people: { code: string; birthYear: number; age: string; tier: number; consentVersion: string; consentedAt: string }[] = [];
  for (const e of enrolled) {
    const p = repo.getParticipant(e.participantId); if (!p) continue;
    const code = pseudonym(secret, p.id);
    people.push({ code, birthYear: p.birthYear, age: ageBucket(p.birthYear, year), tier: e.tier, consentVersion: e.consentVersion, consentedAt: shiftDate(e.consentedAt.slice(0, 10), p) });
    const sleepBy = new Map(repo.listSessions(p.id).map((s) => [s.id, s.context?.sleepHours]));
    let n = 0;
    for (const o of repo.observationsForParticipant(p.id)) {
      if (!enabled.has(o.domain)) continue;
      if (since && o.day < since) continue;
      const note = e.tier === 2 && NOTE_DOMAINS.includes(o.domain) && o.raw ? scrubTranscript(o.raw, names) : "";
      rows.push({ person: code, date: shiftDate(o.day, p), domain: o.domain, value: o.score, slot: o.slot, weight: o.weight, tier: e.tier, note, sleep: sleepBy.get(o.sessionId), id: `${code}-${++n}` });
    }
  }
  mkdirSync(EXPORTS_PATH, { recursive: true });
  const base = join(EXPORTS_PATH, study.studyCode);
  const counts: Record<string, number> = { participants: people.length, observations: rows.length, withdrawnExcluded: all.length - enrolled.length };
  let path: string;
  if (format === "fhir") {
    const entries: unknown[] = [{ resource: { resourceType: "ResearchStudy", id: study.studyCode.toLowerCase(), status: "active", title: study.name, description: `Cadence: ${study.cadence}` } }];
    for (const pp of people) {
      entries.push({ resource: { resourceType: "Patient", id: pp.code, birthDate: String(pp.birthYear), extension: [{ url: "http://lantern.dev/fhir/StructureDefinition/age-bucket", valueString: pp.age }] } });
      entries.push({ resource: { resourceType: "ResearchSubject", id: `rs-${pp.code}`, status: "on-study", study: { reference: `ResearchStudy/${study.studyCode.toLowerCase()}` }, individual: { reference: `Patient/${pp.code}` },
        extension: [{ url: "http://lantern.dev/fhir/StructureDefinition/consent-version", valueString: pp.consentVersion }, { url: "http://lantern.dev/fhir/StructureDefinition/consent-tier", valueInteger: pp.tier }, { url: "http://lantern.dev/fhir/StructureDefinition/consented-on-shifted", valueDate: pp.consentedAt }] } });
    }
    for (const r of rows) {
      const m = MEASURES[r.domain];
      entries.push({ resource: { resourceType: "Observation", id: r.id, status: "final", code: { coding: [{ system: CODE_SYSTEM, code: m.code, display: m.display }], text: m.display }, subject: { reference: `Patient/${r.person}` },
        effectiveDateTime: r.date, valueQuantity: { value: r.value, unit: m.unit },
        component: [{ code: { text: "session-slot" }, valueString: r.slot }, { code: { text: "weight" }, valueQuantity: { value: r.weight } }, ...(r.sleep != null ? [{ code: { text: "sleep-hours" }, valueQuantity: { value: r.sleep, unit: "h" } }] : []), ...(DOMAIN_META[r.domain].experimental ? [{ code: { text: "experimental" }, valueBoolean: true }] : [])],
        ...(r.note ? { note: [{ text: r.note }] } : {}) } });
    }
    path = `${base}.fhir.json`;
    writeFileSync(path, JSON.stringify({ resourceType: "Bundle", type: "collection", meta: { tag: [{ code: "deidentified" }] }, entry: entries }));
    counts.resources = entries.length;
  } else {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ["person_id,observation_date,measurement_concept,measurement_name,value_as_number,unit,session_slot,weight,study_code,consent_tier,sleep_hours,transcript_deid"];
    for (const r of rows) { const m = MEASURES[r.domain]; lines.push([r.person, r.date, m.concept, m.code, r.value, m.unit, r.slot, r.weight, study.studyCode, r.tier, r.sleep ?? "", q(r.note)].join(",")); }
    path = `${base}.csv`;
    writeFileSync(path, lines.join("\n") + "\n");
    const dict = ["column,description", "person_id,Pseudonymous participant code (HMAC with a per-study secret)", "observation_date,Date shifted by a per-participant random offset (-365..0 days)",
      "measurement_concept,Local concept id (not an OMOP standard concept; mapping is a TODO)", "measurement_name,Local measure code", "value_as_number,Score or measurement", "unit,Unit of the value", "session_slot,morning/midday/evening",
      "weight,Context weight (0.5 when sleep was short or the person had a rough day)", "study_code,Study code", "consent_tier,1 scores only; 2 scores plus de-identified transcripts", "sleep_hours,Self-reported sleep hours",
      "transcript_deid,De-identified transcript (Tier 2 only; empty otherwise)", ...Object.values(MEASURES).map((m) => `measure ${m.code},${m.display.replace(/,/g, ";")}`)];
    writeFileSync(`${base}.data_dictionary.csv`, dict.join("\n") + "\n");
    counts.files = 2;
  }
  return { path, counts, deidentification: DEID_SUMMARY, product: PRODUCT.name };
}
