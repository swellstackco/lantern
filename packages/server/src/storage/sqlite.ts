import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AlertRecord, Domain, Enrollment, Fact, Observation, OutboxItem, Participant, Session, Study, WordlistUse } from "@lantern/shared";
import type { ObsRow, Repo } from "./repo.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, name TEXT, birth_year INTEGER, tz TEXT, city TEXT,
  care_circle TEXT, mode TEXT, baseline TEXT, created_at TEXT, date_shift_days INTEGER, synthetic INTEGER);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, participant_id TEXT, slot TEXT, started_at TEXT, ended_at TEXT,
  weight REAL, day TEXT, context TEXT);
CREATE INDEX IF NOT EXISTS idx_sessions_p ON sessions(participant_id, day);
CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, session_id TEXT, domain TEXT, item_id TEXT, raw TEXT, score REAL,
  features TEXT, acoustic TEXT);
CREATE INDEX IF NOT EXISTS idx_obs_s ON observations(session_id);
CREATE TABLE IF NOT EXISTS facts (participant_id TEXT, date TEXT, kind TEXT, text TEXT);
CREATE INDEX IF NOT EXISTS idx_facts_p ON facts(participant_id, date);
CREATE TABLE IF NOT EXISTS wordlist_usage (participant_id TEXT, list_id INTEGER, used_on TEXT);
CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, participant_id TEXT, level TEXT, domains TEXT, opened_at TEXT, closed_at TEXT, notified_at TEXT);
CREATE TABLE IF NOT EXISTS studies (study_code TEXT PRIMARY KEY, name TEXT, cadence TEXT, domains_enabled TEXT, consent_version TEXT, consent_text TEXT, pi_contact TEXT);
CREATE TABLE IF NOT EXISTS enrollments (participant_id TEXT, study_code TEXT, tier INTEGER, consent_version TEXT, consented_at TEXT, withdrawn_at TEXT, proxy_name TEXT,
  PRIMARY KEY (participant_id, study_code));
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, channel TEXT, recipient TEXT, subject TEXT, body TEXT, created_at TEXT, kind TEXT);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
`;
const TABLES = ["participants", "sessions", "observations", "facts", "wordlist_usage", "alerts", "studies", "enrollments", "outbox", "kv"];

const j = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
const p = <T>(s: string | null): T | undefined => (s == null ? undefined : (JSON.parse(s) as T));

export class SqliteRepo implements Repo {
  private db: Database.Database;
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  upsertParticipant(x: Participant) {
    this.db.prepare(`INSERT OR REPLACE INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      x.id, x.name, x.birthYear, x.tz, x.city ?? null, j(x.careCircle), x.mode, j(x.baseline), x.createdAt, x.dateShiftDays, x.synthetic ? 1 : 0);
  }
  private rowP(r: any): Participant {
    return { id: r.id, name: r.name, birthYear: r.birth_year, tz: r.tz, city: r.city ?? undefined, careCircle: p(r.care_circle) ?? [], mode: r.mode,
      baseline: p(r.baseline) ?? {}, createdAt: r.created_at, dateShiftDays: r.date_shift_days, synthetic: !!r.synthetic };
  }
  getParticipant(id: string) { const r = this.db.prepare(`SELECT * FROM participants WHERE id=?`).get(id); return r ? this.rowP(r) : undefined; }
  listParticipants() { return this.db.prepare(`SELECT * FROM participants ORDER BY created_at, id`).all().map((r) => this.rowP(r)); }

  addSession(s: Session) {
    this.db.prepare(`INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)`).run(s.id, s.participantId, s.slot, s.startedAt, s.endedAt ?? null, s.weight, s.day, j(s.context));
  }
  private rowS(r: any): Session {
    return { id: r.id, participantId: r.participant_id, slot: r.slot, startedAt: r.started_at, endedAt: r.ended_at ?? undefined, weight: r.weight, day: r.day, context: p(r.context) };
  }
  getSession(id: string) { const r = this.db.prepare(`SELECT * FROM sessions WHERE id=?`).get(id); return r ? this.rowS(r) : undefined; }
  updateSession(id: string, patch: Partial<Session>) {
    const cur = this.getSession(id); if (!cur) throw new Error(`no session ${id}`);
    const s = { ...cur, ...patch };
    this.db.prepare(`UPDATE sessions SET slot=?, started_at=?, ended_at=?, weight=?, day=?, context=? WHERE id=?`).run(s.slot, s.startedAt, s.endedAt ?? null, s.weight, s.day, j(s.context), id);
  }
  listSessions(pid: string, sinceDay?: string) {
    return this.db.prepare(`SELECT * FROM sessions WHERE participant_id=? AND day>=? ORDER BY started_at`).all(pid, sinceDay ?? "").map((r) => this.rowS(r));
  }

  addObservation(o: Observation) {
    this.db.prepare(`INSERT INTO observations VALUES (?,?,?,?,?,?,?,?)`).run(o.id, o.sessionId, o.domain, o.itemId, o.raw, o.score, j(o.features), j(o.acoustic));
  }
  private rowO(r: any): Observation {
    return { id: r.id, sessionId: r.session_id, domain: r.domain, itemId: r.item_id, raw: r.raw, score: r.score, features: p(r.features), acoustic: p(r.acoustic) };
  }
  observationsForSession(sid: string) { return this.db.prepare(`SELECT * FROM observations WHERE session_id=? ORDER BY rowid`).all(sid).map((r) => this.rowO(r)); }
  observationsForParticipant(pid: string, domain?: Domain): ObsRow[] {
    const rows = this.db.prepare(`SELECT o.*, s.day, s.slot, s.weight, s.participant_id FROM observations o JOIN sessions s ON s.id=o.session_id
      WHERE s.participant_id=? ${domain ? "AND o.domain=?" : ""} ORDER BY s.day, s.started_at, o.rowid`).all(...(domain ? [pid, domain] : [pid])) as any[];
    return rows.map((r) => ({ ...this.rowO(r), day: r.day, slot: r.slot, weight: r.weight, participantId: r.participant_id }));
  }

  addFact(f: Fact) { this.db.prepare(`INSERT INTO facts VALUES (?,?,?,?)`).run(f.participantId, f.date, f.kind, f.text); }
  listFacts(pid: string, kind?: Fact["kind"], since?: string): Fact[] {
    return (this.db.prepare(`SELECT * FROM facts WHERE participant_id=? AND date>=? ${kind ? "AND kind=?" : ""} ORDER BY date, rowid`)
      .all(...(kind ? [pid, since ?? "", kind] : [pid, since ?? ""])) as any[]).map((r) => ({ participantId: r.participant_id, date: r.date, kind: r.kind, text: r.text }));
  }

  addWordlistUse(u: WordlistUse) { this.db.prepare(`INSERT INTO wordlist_usage VALUES (?,?,?)`).run(u.participantId, u.listId, u.usedOn); }
  listWordlistUse(pid: string): WordlistUse[] {
    return (this.db.prepare(`SELECT * FROM wordlist_usage WHERE participant_id=? ORDER BY used_on, rowid`).all(pid) as any[]).map((r) => ({ participantId: r.participant_id, listId: r.list_id, usedOn: r.used_on }));
  }

  addAlert(a: AlertRecord) { this.db.prepare(`INSERT INTO alerts VALUES (?,?,?,?,?,?,?)`).run(a.id, a.participantId, a.level, j(a.domains), a.openedAt, a.closedAt ?? null, a.notifiedAt ?? null); }
  private rowA(r: any): AlertRecord {
    return { id: r.id, participantId: r.participant_id, level: r.level, domains: p(r.domains) ?? [], openedAt: r.opened_at, closedAt: r.closed_at ?? undefined, notifiedAt: r.notified_at ?? undefined };
  }
  updateAlert(id: string, patch: Partial<AlertRecord>) {
    const r = this.db.prepare(`SELECT * FROM alerts WHERE id=?`).get(id); if (!r) throw new Error(`no alert ${id}`);
    const a = { ...this.rowA(r), ...patch };
    this.db.prepare(`UPDATE alerts SET level=?, domains=?, opened_at=?, closed_at=?, notified_at=? WHERE id=?`).run(a.level, j(a.domains), a.openedAt, a.closedAt ?? null, a.notifiedAt ?? null, id);
  }
  listAlerts(pid: string) { return this.db.prepare(`SELECT * FROM alerts WHERE participant_id=? ORDER BY opened_at`).all(pid).map((r) => this.rowA(r)); }
  openAlert(pid: string) { const r = this.db.prepare(`SELECT * FROM alerts WHERE participant_id=? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`).get(pid); return r ? this.rowA(r) : undefined; }

  upsertStudy(s: Study) {
    this.db.prepare(`INSERT OR REPLACE INTO studies VALUES (?,?,?,?,?,?,?)`).run(s.studyCode, s.name, s.cadence, j(s.domainsEnabled), s.consentVersion, s.consentText, s.piContact);
  }
  private rowStudy(r: any): Study {
    return { studyCode: r.study_code, name: r.name, cadence: r.cadence, domainsEnabled: p(r.domains_enabled) ?? [], consentVersion: r.consent_version, consentText: r.consent_text, piContact: r.pi_contact };
  }
  getStudy(code: string) { const r = this.db.prepare(`SELECT * FROM studies WHERE study_code=?`).get(code.toUpperCase()); return r ? this.rowStudy(r) : undefined; }
  listStudies() { return this.db.prepare(`SELECT * FROM studies ORDER BY study_code`).all().map((r) => this.rowStudy(r)); }

  upsertEnrollment(e: Enrollment) {
    this.db.prepare(`INSERT OR REPLACE INTO enrollments VALUES (?,?,?,?,?,?,?)`).run(e.participantId, e.studyCode, e.tier, e.consentVersion, e.consentedAt, e.withdrawnAt ?? null, e.proxyName ?? null);
  }
  private rowE(r: any): Enrollment {
    return { participantId: r.participant_id, studyCode: r.study_code, tier: r.tier, consentVersion: r.consent_version, consentedAt: r.consented_at, withdrawnAt: r.withdrawn_at ?? undefined, proxyName: r.proxy_name ?? undefined };
  }
  getEnrollment(pid: string, code: string) { const r = this.db.prepare(`SELECT * FROM enrollments WHERE participant_id=? AND study_code=?`).get(pid, code.toUpperCase()); return r ? this.rowE(r) : undefined; }
  listEnrollments(code?: string) {
    return (code ? this.db.prepare(`SELECT * FROM enrollments WHERE study_code=? ORDER BY participant_id`).all(code.toUpperCase()) : this.db.prepare(`SELECT * FROM enrollments ORDER BY study_code, participant_id`).all()).map((r) => this.rowE(r));
  }

  addOutbox(o: OutboxItem) { this.db.prepare(`INSERT INTO outbox VALUES (?,?,?,?,?,?,?)`).run(o.id, o.channel, o.to, o.subject, o.body, o.createdAt, o.kind ?? null); }
  listOutbox(limit = 50): OutboxItem[] {
    return (this.db.prepare(`SELECT * FROM outbox ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit) as any[]).map((r) => ({ id: r.id, channel: r.channel, to: r.recipient, subject: r.subject, body: r.body, createdAt: r.created_at, kind: r.kind ?? undefined }));
  }

  getKv(key: string) { return (this.db.prepare(`SELECT value FROM kv WHERE key=?`).get(key) as any)?.value; }
  setKv(key: string, value: string) { this.db.prepare(`INSERT OR REPLACE INTO kv VALUES (?,?)`).run(key, value); }

  reset() { for (const t of TABLES) this.db.exec(`DELETE FROM ${t}`); }
  close() { this.db.close(); }
}
