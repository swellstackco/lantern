# Lantern for researchers

Lantern is a wellness and research tool. It does not diagnose, treat, cure, or prevent any disease. Everything below is a flag for a conversation, not a diagnosis. All data in this repository is synthetic.

## What is measured

Tier A (text, works through Alexa+ today):

| Measure | Construct | How | Score |
|---|---|---|---|
| Delayed word recall | Episodic memory | Three words given in one session, asked back later the same day (or at the next session) | 0-3 free, +0.5 per word on a category cue |
| Category fluency | Semantic retrieval | "Name as many animals as you can in one breath"; 12 rotating categories | distinct items; repetitions and intrusions logged |
| Orientation | Temporal orientation | Day of week plus month or season | scaled to 0-3 |
| Autobiographical consistency (exploratory) | Autobiographical memory | Yesterday's day story is asked about the next day | 0 none, 1 partial, 2 consistent (keyword judge; an LLM judge can plug in) |
| Story repetition index (exploratory) | Retelling the same story | Cosine similarity of today's story with the last 14 days | 0-1 |
| Language features (exploratory) | Word finding | Fillers ("um", "thing", "whatchamacallit"), self-corrections, type-token ratio, mean sentence length | counts and floats |
| Context | Confounds | Sleep hours, mood word, rough day | stored; short sleep or a rough day halves the weight of that day |

Tier B (voice; browser simulator only, experimental): pitch range (F0 IQR), pitch median, loudness, speaking rate, pause ratio, syllable rate. Computed in the browser from the microphone. Raw audio is never uploaded; only these six numbers leave the page. Alexa+ add-ons do not receive audio features today (see docs/FEEDBACK-LOG.md).

Word triplets: 40 hand-written triplets of concrete one- or two-syllable nouns, one nature word, one small object, one place per triplet, no triplet reused within 30 days. Not validated against any published instrument.

## Statistics

- Baseline: first 14 scored days per domain. Stored: mean, SD (with a per-domain floor), split-half reliability (floored at 0.5, a placeholder).
- Daily domain score is the weighted mean of that day's observations. z = polarity x (x - mean) / SD, so negative always means "worse than your usual".
- Drift detector: EWMA control chart, lambda 0.2, weights 1.0 or 0.5 (context). A domain qualifies when its EWMA has stayed at or below -0.5 for 10 or more consecutive scored days (at least 8 observations) and is at or below -1.0 today. Notice = two or more domains qualify, or one at -1.5. Watch = one domain. One bad day cannot qualify (z of -3 moves the EWMA by -0.6 and it decays).
- Reliable Change Index for the doctor summary: (mean of last 14 scored days - baseline mean) / (sqrt(2) x SD x sqrt(1 - r)). Beyond 1.96 is "reliable change". Secondary; EWMA is what raises a flag.
- Variability index: 14-day coefficient of variation divided by baseline coefficient of variation. Reported, never alerts alone.
- Missing data: days without sessions are skipped, never imputed. If fewer than 40% of the last 14 days have a check-in the status is "not enough data" and never a flag.
- One flag per 14 days. The participant never sees alert text.
- Thresholds are placeholders to be set from validation data.

## Consent model

Participant self-consent by voice (`record_consent` stores the spoken assent, the study's consent version, the tier, and a timestamp). Proxy consent for a legal representative is recorded in `proxyName`. Two tiers: Tier 1 derived scores only; Tier 2 adds de-identified transcripts. Withdraw any time by voice ("Alexa, tell Lantern to stop sharing my data"): the participant is excluded from every later export. What happens to earlier exports is the study's policy, stated in the consent text. Consent text is versioned per study (`LANTERN-PILOT`, `BURST-DEMO` are seeded).

## De-identification

Safe Harbor style, conservative:
- Participant code: `P-` plus the first 10 hex characters of HMAC-SHA256(per-study secret, participant id).
- Dates: a per-participant random shift of -365 to 0 days, consistent within a participant. Original dates are not exported.
- Age: birth year only, ages over 89 bucketed as 90+. No ZIP, city, address, device id, or name fields exist in the export.
- Transcripts: Tier 2 only, and only for the two narrative measures (story repetition, autobiographical consistency). Known names (participants, care circle), places, months and dates, years, emails, phone numbers, and mid-sentence capitalized words are replaced with placeholders.
- Withdrawn participants are excluded.

## Export schema

`export_research_data(studyCode, format, since?)` writes to `exports/` (served at `/exports/...`).

FHIR R4 Bundle (`<STUDY>.fhir.json`): `ResearchStudy`, one `Patient` per participant (code as id, birth year as birthDate, age-bucket extension), one `ResearchSubject` (status, consent version, consent tier extensions), and one `Observation` per score. Observation codes use a local CodeSystem `http://lantern.dev/fhir/CodeSystem/measures` (`delayed-recall-3`, `category-fluency-count`, `orientation-3`, `autobiographical-consistency`, `story-repetition-index`, `filler-word-count`, `voice-f0-iqr`, `speaking-rate`). No LOINC codes are claimed; mapping to LOINC or OMOP standard concepts is a TODO for a terminologist. Components carry slot, weight, sleep hours, and an "experimental" flag.

CSV (`<STUDY>.csv` plus `<STUDY>.data_dictionary.csv`), OMOP-friendly: `person_id, observation_date, measurement_concept, measurement_name, value_as_number, unit, session_slot, weight, study_code, consent_tier, sleep_hours, transcript_deid`.

Where it could be contributed: platforms such as the Alzheimer's Disease Data Initiative AD Workbench or GAAIN, subject to each platform's data-contribution process. No relationship is implied.

## Validation plan (not done; say so out loud)

Not validated: all thresholds, the autobiographical-consistency and story-repetition measures, the acoustic proxies, the keyword scoring. Validated constructs borrowed from the literature: delayed word recall, category fluency, orientation, high-frequency burst sampling (M2C2, ARC), within-person variability.
1. Phase 0 feasibility (about 30 people, 60+, 4 weeks): adherence (target 80% or more), acceptability, speech recognition errors on older voices, scoring agreement against two human raters.
2. Phase 1 convergent validity (about 150): 14-day aggregates against a standard neuropsychological battery and against ARC or M2C2; test-retest ICC of 0.8 or more for 7-day aggregates; practice-effect curves across parallel forms; set thresholds from empirical false-alarm rates.
3. Phase 2 longitudinal (about 500, 2 to 3 years, in an existing biomarker cohort): do personal-drift flags precede clinical progression, pre-registered.
4. Regulatory: stays a general-wellness and research tool. A claim that it "detects MCI" would make it software as a medical device and need FDA review. IRB approval is required before any human data.

Sources: M2C2 (Penn State, Sliwinski); ARC (WashU, Hassenstab); Rusz et al., Ann Neurol 2021 on voice change before Parkinson's motor signs.
