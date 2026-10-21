import type { AlertRecord, Domain, Enrollment, Fact, Observation, OutboxItem, Participant, Session, Slot, Study, WordlistUse } from "@lantern/shared";

export type ObsRow = Observation & { day: string; slot: Slot; weight: number; participantId: string };

/** Storage seam. SqliteRepo is the implementation; a DynamoRepo could implement the same interface (stretch). */
export interface Repo {
  upsertParticipant(p: Participant): void;
  getParticipant(id: string): Participant | undefined;
  listParticipants(): Participant[];

  addSession(s: Session): void;
  updateSession(id: string, patch: Partial<Session>): void;
  getSession(id: string): Session | undefined;
  listSessions(participantId: string, sinceDay?: string): Session[];

  addObservation(o: Observation): void;
  observationsForSession(sessionId: string): Observation[];
  observationsForParticipant(participantId: string, domain?: Domain): ObsRow[];

  addFact(f: Fact): void;
  listFacts(participantId: string, kind?: Fact["kind"], sinceDate?: string): Fact[];

  addWordlistUse(u: WordlistUse): void;
  listWordlistUse(participantId: string): WordlistUse[];

  addAlert(a: AlertRecord): void;
  updateAlert(id: string, patch: Partial<AlertRecord>): void;
  listAlerts(participantId: string): AlertRecord[];
  openAlert(participantId: string): AlertRecord | undefined;

  upsertStudy(s: Study): void;
  getStudy(code: string): Study | undefined;
  listStudies(): Study[];
  upsertEnrollment(e: Enrollment): void;
  getEnrollment(participantId: string, studyCode: string): Enrollment | undefined;
  listEnrollments(studyCode?: string): Enrollment[];

  addOutbox(o: OutboxItem): void;
  listOutbox(limit?: number): OutboxItem[];

  getKv(key: string): string | undefined;
  setKv(key: string, value: string): void;
  /** Delete all rows (used by the seed script). */
  reset(): void;
  close(): void;
}
