import type { Study } from "@lantern/shared";

const CONSENT_V1 = `This is a research study about memory and speech. Here is what to know.

What happens: Alexa asks you a few short, friendly questions each day. They take less than a minute each. We compare your answers to your own usual answers over time.

What we keep: Your scores and your answers. If you pick Tier 2, we also share your words with the study team after names and places are taken out. If you pick Tier 1, we share only your scores.

Who sees it: The study team sees a code, never your name. Your family sees a short weekly note if you say yes.

You can stop at any time. Just say "Alexa, tell Lantern to stop sharing my data." We stop sharing right away. Data already shared stays in the study, as the study rules say.

Lantern is a wellness and research tool. It does not diagnose, treat, cure, or prevent any disease. It is not a substitute for a doctor.`;

export const SEED_STUDIES: Study[] = [
  { studyCode: "LANTERN-PILOT", name: "Lantern Pilot: everyday talk and memory", cadence: "daily", domainsEnabled: ["recall", "fluency", "orientation", "consistency", "repetition", "fillers"], consentVersion: "1.0", consentText: CONSENT_V1, piContact: "pilot-team@example.com" },
  { studyCode: "BURST-DEMO", name: "Burst Demo: one week each month", cadence: "burst", domainsEnabled: ["recall", "fluency", "orientation"], consentVersion: "1.0", consentText: CONSENT_V1, piContact: "burst-team@example.com" },
];
