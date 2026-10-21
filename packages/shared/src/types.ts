/** Domain types: SPEC section 8 state model. */
export type Slot = "morning" | "midday" | "evening";
export type Mode = "atRisk" | "diagnosed" | "recovery";

/** Scored domains. "worse" polarity domains (higher is worse) are flipped when z-scored. */
export type Domain =
  | "recall" | "fluency" | "orientation" | "consistency"
  | "repetition" | "fillers" | "f0Iqr" | "wordsPerSec";

export const DOMAIN_META: Record<Domain, { label: string; polarity: 1 | -1; experimental: boolean; tierB: boolean }> = {
  recall: { label: "Word recall", polarity: 1, experimental: false, tierB: false },
  fluency: { label: "Word finding", polarity: 1, experimental: false, tierB: false },
  orientation: { label: "Day and season", polarity: 1, experimental: false, tierB: false },
  consistency: { label: "Remembering yesterday", polarity: 1, experimental: true, tierB: false },
  repetition: { label: "Repeated stories", polarity: -1, experimental: true, tierB: false },
  fillers: { label: "Placeholder words", polarity: -1, experimental: true, tierB: false },
  f0Iqr: { label: "Voice range", polarity: 1, experimental: true, tierB: true },
  wordsPerSec: { label: "Speaking rate", polarity: 1, experimental: true, tierB: true },
};
export const ALERT_DOMAINS: Domain[] = ["recall", "fluency", "consistency", "orientation", "repetition", "fillers"];

export interface BaselineStats { mu: number; sigma: number; r: number; n: number; completedOn: string }

export interface CareContact { name: string; email: string; relation?: string }

export interface Participant {
  id: string;
  name: string;
  birthYear: number;
  tz: string;
  city?: string;
  careCircle: CareContact[];
  mode: Mode;
  baseline: Partial<Record<Domain, BaselineStats>>;
  createdAt: string;
  /** Per-participant random date offset in days (-365..0) used for exports. */
  dateShiftDays: number;
  synthetic: boolean;
}

export interface Session {
  id: string; participantId: string; slot: Slot;
  startedAt: string; endedAt?: string; weight: number;
  /** local date YYYY-MM-DD in participant tz */
  day: string;
  context?: { sleepHours?: number; mood?: string; roughDay?: boolean };
}

export interface AcousticFeatures {
  rmsDb: number; f0Median: number; f0Iqr: number; wordsPerSec: number; pauseRatio: number; syllRate: number;
}

export interface Observation {
  id: string; sessionId: string; domain: Domain; itemId: string;
  raw: string; score: number; features?: Record<string, number>; acoustic?: AcousticFeatures;
}

export interface Fact { participantId: string; date: string; kind: "dayStory" | "event"; text: string }
export interface WordlistUse { participantId: string; listId: number; usedOn: string }

export type AlertLevel = "watch" | "notice";
export interface AlertRecord {
  id: string; participantId: string; level: AlertLevel; domains: Domain[];
  openedAt: string; closedAt?: string; notifiedAt?: string;
}

export interface Study {
  studyCode: string; name: string; cadence: "daily" | "burst";
  domainsEnabled: Domain[]; consentVersion: string; consentText: string; piContact: string;
}
export interface Enrollment {
  participantId: string; studyCode: string; tier: 1 | 2;
  consentVersion: string; consentedAt: string; withdrawnAt?: string; proxyName?: string;
}
export interface OutboxItem {
  id: string; channel: "email" | "sms" | "file"; to: string; subject: string; body: string; createdAt: string; kind?: string;
}
