# Lantern — early light on memory and speech change, through everyday talk with Alexa

Spec v1 · 2026-10-21 · Author: Fable (design/architecture) · Builder: Sonnet · Owner: Ben
Hackathon: Build, Ship, Shape: Amazon Developer Hackathon — Alexa+ track (+ AWS Builder + Open Source mini)
Deadline: Oct 23 2026 12:00 PDT (Oct 24 03:00 Manila). Target submit Oct 23 ~21:00 Manila.

Working name: **Lantern** (was "Baseline"). Why change: "Project Baseline" is Verily/Google's well-known health study brand — a judge in health will notice. "Lantern" = light, early, warm, home. Fallback names: "Hearth", "Steady". Ben decides (see §12).

---

## 0. One-line pitch

**Lantern turns the Alexa you already talk to into a consented, research-grade early-warning instrument for memory and speech change — short friendly questions through the day, scored against your own baseline, with drift flagged to family and shared (de-identified) with Alzheimer's research.**

Three audiences, one dataset:
1. **Participant** (primary): adults ~60+ who are cognitively healthy or "worried well" (family history, or they feel their memory slipping). Never hears "decline." Hears "good morning."
2. **Family / care circle** (secondary): adult child far away. Gets a calm weekly digest, a gentle alert only on *sustained* change, and a one-page doctor summary.
3. **Study teams** (headline for judges): enroll a cohort by study code, per-study consent text, de-identified longitudinal export (FHIR + CSV), aggregate dashboard.

Why it wins on the judges' own rubric:
- **Tech**: real Streamable HTTP MCP server on spec 2025-11-25, MCP Apps views (`_meta.ui`), Agent Skill, Bedrock orchestration, Lambda deploy, a web client that is a *real* MCP client, and Claude Desktop calling the same server.
- **Design**: matches Alexa+ add-on conventions (data-not-scripts, cards inline, fullscreen for the one-pager, 500 ms first paint, self-contained tool results).
- **Impact**: specific population (preclinical/at-risk window), specific payoff (months-earlier conversation with a doctor; longitudinal data for research), credible path (validation plan, IRB, consent).
- **Idea**: judges' "creative" list = agentic cross-service workflow, state across sessions, cards, MCP Apps, Agent Skills. We hit every item. Nobody in prior Amazon hackathons did *measurement*; prior winners did *memory aids*.

---

## 1. The problem and the research method we're copying (honestly)

**Problem.** Alzheimer's pathology begins 10–20 years before diagnosis. The window where research most needs data and where early intervention matters is the *preclinical / subjective-decline / MCI* window — people who are fine on a 10-minute clinic test. Clinic tests happen once a year, are stressful, and have big practice effects. Families notice change months late because every single day looks normal.

**The method that already works (verified, cite in Devpost):**
- **Measurement-burst / high-frequency remote cognitive assessment.** Penn State's **M2C2 (Mobile Monitoring of Cognitive Change, PI Martin Sliwinski)**: brief smartphone tests morning/afternoon/evening over 8-day bursts; one study of 120 cognitively unimpaired older adults reported **89.3% compliance** (J. Int. Neuropsychol. Soc., 2024). Open-source platform; used inside the Einstein Aging Study (age 70+). Source: healthyaging.psu.edu/research/research-projects/mobile-monitoring-cognitive-change-m2c2
- **ARC (Ambulatory Research in Cognition, WashU, Jason Hassenstab)**: up to 4 short sessions/day for 7 days; 268 cognitively normal + 22 very-mild-dementia participants; **reliability > 0.85** across the 7-day cycle and at 6- and 12-month retest (Alzheimer's & Dementia, 2023). Used in DIAN and Knight ADRC studies. Source: profiles.wustl.edu/en/publications/unsupervised-high-frequency-smartphone-based-cognitive-assessment/
- **Within-person variability is itself a signal**: a 16-day burst study found variability in processing speed and visual memory binding may specifically detect MCI (M2C2 line of work); ARC group reports symptomatic participants show greater variability than cognitively normal.
- **Voice assistants for cognition**: Dartmouth/UMass Boston extracted 163 features from Alexa commands of 40 older adults (MCI vs healthy; Computer Speech & Language, 2022); UNC has an NIA R01 (R01AG067416) on voice-assistant home assessment; U. Lethbridge 2025 smart-speaker memory test (n=24, ages 63–78) agreed with human-administered scoring. So the direction is taken seriously; nobody has shipped it on a consumer assistant.

**Our novelty vs M2C2/ARC** (say this in the video): they need a phone app and finger-tap tests. Lantern needs *nothing new* — the smart speaker already in the kitchen — and it is **voice-native**: it measures recall, fluency and language the way a neuropsychologist does (by talking), plus a signal nobody else captures at home: **autobiographical consistency** ("yesterday you told me your granddaughter visited — how was that?"). Flag: autobiographical consistency and story-repetition are *exploratory, unvalidated* measures. Say so.

**Age framing (recommend):** enroll **60+** (55+ with first-degree family history), self-reported cognitively healthy or with subjective memory complaints. Rationale (from memory; flag): large preclinical AD trials (e.g., A4) enrolled cognitively unimpaired adults 65–85; subjective cognitive decline (SCD) is a recognized at-risk construct (Jessen et al. 2014). Already-diagnosed MCI/dementia = secondary mode (progression tracking, proxy consent).

---

## 2. What we measure — two tiers, and conditions covered

**Critical constraint (verified in Alexa+ docs):** an Alexa+ MCP add-on receives *text*. `tools/call` arrives with `params.name` + `params.arguments` that Alexa+ extracts from the conversation; tool results return `structuredContent`/`content`/`_meta.ui`. No audio, no timings, no prosody reach the server. (Source: mcp-toolkit-client-lifecycle.) Design around this and turn it into a feature request (§11).

### Tier A — text signals (work through Alexa+ today; all server-side)
| Signal | Construct | How | Score |
|---|---|---|---|
| Delayed recall | Episodic memory (most sensitive in preclinical AD) | 3 words given in one session, asked back in the *next* session (2–8 h delay; also same-session 1-min recall on days with one session only) | 0–3 free; +0.5 per word on category cue |
| Category fluency | Semantic memory / retrieval | "Name as many animals as you can in one breath" → count distinct valid members; categories rotate (animals, fruits, kitchen things, clothes, cities, tools…) | distinct count; repetitions + intrusions logged |
| Orientation | Temporal orientation | Woven into greeting: "What day is it today?" / "What season does it feel like?" — truth known | 0–3 |
| Autobiographical consistency (exploratory, novel) | Episodic/autobiographical memory | Evening: "What was the best part of today?" stored. Next morning (or 2 days later, randomized): "Yesterday you mentioned ___ — tell me about it." Compare to stored text | 0 none / 1 partial / 2 consistent (LLM judge on Bedrock; keyword-overlap fallback) |
| Story repetition index (exploratory) | Early AD sign (retelling the same story) | Cosine/keyword similarity of today's "day story" vs prior 14 days | 0–1 |
| Language features (exploratory) | Lexical-semantic; PPA/FTD word-finding | From transcripts: words per response, type-token ratio, filler/placeholder words ("thing", "whatchamacallit", "um"), self-corrections, mean sentence length | floats |
| Context covariates | Confounds | Sleep hours, mood (1–5 words), "rough day?" (illness, stress) | stored, used to downweight |
| Within-day variability | Lewy body fluctuation, MCI variability | Morning vs evening recall/fluency gap, week-level CV | floats |

### Tier B — acoustic signals (browser-only, in our simulator; a feature request for Alexa+)
Computed **in the browser from the mic with Web Audio**, never uploading raw audio; only 6 numbers per utterance leave the page. Presented honestly as "what Alexa+ could enable with a consented acoustic-features API."
| Feature | How (cheap, defensible) | Why |
|---|---|---|
| Loudness (RMS dB) | AnalyserNode time-domain RMS | Hypophonia (Parkinson's) |
| Pitch (F0) median + range (IQR) | Autocorrelation pitch tracker (or `pitchy` npm) on voiced frames | Monopitch / reduced F0 variability — reduced pitch variability distinguished prodromal PD (iRBD) from controls before motor signs (Rusz et al., Ann Neurol 2021; 448 people, 7 centers) |
| Speaking rate (words/sec) | ASR word count ÷ voiced duration | Bulbar ALS: speaking-rate decline is an early sign (Yunusova et al.; from memory, flag) |
| Pause ratio, mean pause length | Silence detection on RMS threshold | Word-finding (PPA, AD), apathy |
| Articulation proxy | Spectral flux / syllable-rate estimate (`syllables/sec` from envelope peaks) | Slurring proxy — label "experimental" |
No "slur score" claims. Show trends vs personal baseline only.

### Conditions map (brief; what Lantern would notice; clinical descriptions from general consensus, flag where cited)
- **Alzheimer's (demo story)**: delayed recall ↓ first, consistency ↓, fluency ↓ later, story repetition ↑.
- **MCI**: same, subtler; within-person *variability* ↑ (M2C2/ARC finding above).
- **Vascular**: step-wise drops rather than smooth drift (our change-point view shows steps); executive/attention; sudden step = see safety.
- **Lewy body**: *fluctuating* cognition — large within-day and day-to-day variability with preserved mean; monitor variability index.
- **FTD / primary progressive aphasia**: word-finding, fillers, shorter sentences, grammar simplification (nonfluent variant), semantic errors in fluency (semantic variant). Language features tier.
- **Parkinson's**: Tier B monopitch, softer voice, slower rate; voice change can precede motor diagnosis (Rusz 2021, verified above).
- **ALS (bulbar)**: speaking rate ↓, pauses ↑, articulation proxy — Tier B only.
- **MS, post-stroke, TBI**: *recovery* trajectories — upward drift is good news; same engine, sign flipped; fatigue covariate matters.
- **Depression / sleep disorders**: confounders that look like decline; that's why we collect sleep/mood and downweight.

---

## 3. Cadence and conversation design (feels like talk, not a test)

- **Three moments/day**, each ≤ 45 s, 1–3 questions: **Morning** (greeting + orientation + "three words to hold onto"), **Midday / after a reminder** (recall + fluency, or a 2-question mini), **Evening** (day story + sleep + mood). Randomized jitter ±90 min inside each window; domain assignment to slots rotates daily (counterbalanced), so Alexa never asks the same thing at the same time twice in a row.
- Minimum viable day = 1 session. Adherence tracked, never nagged more than once.
- **Burst mode** for studies: 7-day bursts monthly (ARC/M2C2 style) vs **daily** mode. Study config decides.
- **Parallel forms**: 40 word triplets (concrete nouns, 1–2 syllables, matched frequency bands, no semantic overlap within a triplet), no triplet reused within 30 days; 12 fluency categories rotated; orientation phrasing variants.
- **Tone rules (hard)**: 4th–6th grade words; one question at a time; never "test", "score", "wrong"; recall misses get "No worries — they were apple, candle, river. Let's keep going." Participant trend view only ever says "steady", "a little up and down", "let's keep going", and "a good time to mention this to your doctor" (that last line only if the care circle has opted the participant in to hearing it).
- Alexa+ writes the words; our tool results carry `data` + `suggestedPhrasing` + `tone` hints (Amazon: "you influence Alexa's response through the data you return, not by scripting it directly").

Sample morning (mock-mode script, Bedrock paraphrases in AWS mode):
> A: Good morning, Rose. Did you sleep okay?
> R: Not great, maybe five hours.
> A: Five hours — I'll keep that in mind. What day is it today, do you think?
> R: Tuesday.
> A: Right you are. Three words to hold onto for later: **apple, candle, river.** I'll ask you about them after lunch. Have a good morning.

Sample midday:
> A: Hi Rose. Earlier I gave you three words — which ones do you remember?
> R: Apple… and river.
> A: Two of three — the other was candle. Quick one: name as many animals as you can in one breath.
> R: Dog, cat, horse, cow, pig, chicken, lion, tiger…
> A: Eight — nice. Yesterday you said your granddaughter called about her science fair. How did that go?
> R: Oh — she won second place.
> A: That's great. That's all for now.

---

## 4. Statistics — personal baseline and drift (one defensible method)

- **Baseline** = first **14 scored days** per domain (≈ 20–40 observations). Store mean μ₀, SD σ₀, and a split-half within-person reliability r.
- **Daily domain score** = mean of that day's observations, z = (x − μ₀)/σ₀.
- **Context downweighting**: observation weight w = 0.5 if sleep < 5 h or "rough day" = yes or self-reported illness; else 1.0. Downweighted, never excluded (missing-data honesty).
- **Drift detector = EWMA control chart** on z (λ = 0.2, weighted). Signal rule: EWMA ≤ −1.0 for **≥ 10 consecutive scored days** AND ≥ 8 observations in that window, in **≥ 2 domains** (or ≤ −1.5 in one domain). This ignores single bad days by construction (one z = −3 day moves EWMA by −0.6 and decays). Upward crossings (+1.0) in recovery mode = "improving".
- **Reliable Change Index** (for the doctor one-pager): RCI = (mean₁₄ − μ₀) / (√2 · σ₀ · √(1 − r)); |RCI| > 1.96 = "reliable change." Secondary; EWMA is what alerts.
- **Variability index** = rolling 14-day coefficient of variation ÷ baseline CV (Lewy/MCI signal; reported, never alerts alone).
- **Missing data**: days with no sessions are skipped in EWMA (no imputation); if adherence < 40% over 14 days, the status is "not enough data" — never a flag. Sessions cut short count what was scored.
- **Alert ladder**: `watch` (1 domain crosses) → `notice` (rule met) → caregiver gets *one* message, then weekly digest; no re-alert for 14 days. Participant never gets alert copy.
- Honest line for judges: thresholds are placeholders to be set from validation data (§9). Everything is a *flag for a conversation*, not a diagnosis.

Tier B acoustic uses the same EWMA on pitch-range z and speaking-rate z; sudden single-session large drops (z ≤ −3 in rate *and* a slur proxy) trigger the safety path, not the drift path.

---

## 5. Safety, ethics, privacy

- **Not a medical device** (wording for README/Devpost/UI footer): "Lantern is a wellness and research tool. It does not diagnose, treat, cure, or prevent any disease, and it is not a substitute for a doctor. Changes it flags are reasons to talk to a clinician, not conclusions."
- **Stroke / emergency path** (hard): if the participant reports face droop, arm weakness, trouble speaking, sudden confusion, or a fall — or the acoustic/text change in one session is sudden and large — Lantern says plainly: "This could be an emergency. Please call 911 now [or your local emergency number]. I'm letting Maya know." and calls `notify_care_circle(kind: "urgent")`. It never says "stroke." Detect via `report_concern` keyword classifier (mock) / Bedrock classifier (AWS). Caregiver message includes the quoted words and a timestamp.
- **Distress / low mood** two days running → gentle check + caregiver note (not urgent).
- **Consent model**: participant self-consent by voice + web confirmation (cognitively healthy primary user); **proxy consent** by a legally authorized representative for diagnosed secondary users, participant *assent* still asked. Versioned consent text per study (`consentVersion`). Two tiers: Tier 1 derived scores only; Tier 2 adds de-identified transcripts. **Withdraw anytime** by voice ("Alexa, tell Lantern to stop sharing my data") → stops future exports; prior exports governed by the study's policy (stated in consent).
- **De-identification (HIPAA Safe Harbor style)**: no names, no dates finer than year except as *shifted* dates (per-participant random offset −365..0 days, consistent within participant), ages > 89 bucketed as 90+, ZIP truncated to 3 digits or dropped, no device IDs, pseudonymous `participantCode` = HMAC(studySecret, id). Transcripts stripped of named entities (simple NER list + regex) and included only with Tier 2 consent.
- **Privacy at home**: raw audio never leaves the browser (Tier B); Alexa+ handles its own audio. Transcripts stored locally by default; cloud mode encrypts at rest (DynamoDB default) — stretch.
- **No real people's data**: every participant in the repo is synthetic; the demo persona is fictional and labeled so.

---

## 6. Research layer (the headline)

- **Study** = `{studyCode, name, consentText[version], cadence: daily|burst, domainsEnabled, tier, piContact}`. Seed two: `LANTERN-PILOT` (daily) and `BURST-DEMO` (7-on/23-off).
- **Enrollment**: care circle or participant speaks a study code; `enroll_in_study` returns the consent summary (plain words) as an inline card + spoken summary; `record_consent` stores voice assent + timestamp + version; web link for signature (stub page).
- **Export** `export_research_data(studyCode, format, since)`:
  - **FHIR R4 Bundle**: `ResearchStudy`, `ResearchSubject` (status, consent version in extension), pseudonymous `Patient` (birth year, sex optional), `Observation` per score with `code` from a local CodeSystem `http://lantern.dev/fhir/CodeSystem/measures` (e.g., `delayed-recall-3`, `category-fluency-count`), `effectiveDateTime` shifted, `valueQuantity`, `component`s for covariates. Flag: use LOINC only where a code is confirmed to exist — do **not** invent LOINC codes; the mapping table is a TODO for a terminologist. (Claiming "FHIR with LOINC where applicable" is fine; hardcoding guesses is not.)
  - **OMOP-friendly CSV**: `person_id, observation_date(shifted), measurement_concept(local), value_as_number, unit, session_slot, weight, study_code, consent_tier`. Plus `data_dictionary.csv`.
- **Study dashboard** (MCP App, fullscreen): n enrolled, adherence histogram, per-participant sparklines (pseudonymous), flags count, export button. Seed a 12-participant synthetic cohort with mixed trajectories (stable ×7, drift ×3, recovery ×1, low-adherence ×1) so it looks real.
- **Where it could feed** (verified to exist): **ADDI AD Workbench** (Alzheimer's Disease Data Initiative, launched Nov 2020 with Alzheimer's Association, Gates Ventures, Wellcome — federated cloud workbench for dementia datasets) and **GAAIN** (Global Alzheimer's Association Interactive Network — federated data sharing; partnered with AD Workbench, 2024 paper). Say "could be contributed to, subject to each platform's data-contribution process" — do not imply any relationship. NIA: say only "NIA-funded programs such as M2C2 show demand for this kind of data."

---

## 7. Family layer

- **Weekly digest** (email via SES in AWS mode, file in `outbox/` in local mode): adherence, three domain sparklines, sleep/mood, one plain sentence ("Rose's mornings were steady this week."), no numbers unless they expand.
- **Gentle alert** (only `notice` level): "Over the last two weeks Rose's word recall has been a bit lower than her usual. This can have many causes (sleep, stress, a cold). It may be worth a check-up. Here's a one-page summary you can bring." Links the one-pager. Offers: "Want me to add a doctor visit to the calendar?" → `schedule_doctor_visit` writes an `.ics` and emails it (agentic chain across services).
- **Doctor one-pager** (MCP App fullscreen + print CSS): identity line (name, age, enrolled since), 90-day chart per domain with baseline band, EWMA, RCI table, adherence, sleep overlay, flagged window highlighted, the disclaimer, and "what Lantern does NOT measure."
- **Participant view** (inline card): date, a lantern glyph, streak, "steady" words. No charts.

---

## 8. Alexa+ experience — tools, state, cards

Design to Amazon's conventions: one tool = one customer intent; description says when/why/what it returns; declare only implemented params; always return a result (errors as errors); `structuredContent` carries data; `_meta.ui` for views; first paint < 500 ms; self-contained responses that Alexa weaves in.

### Tools (MCP, zod schemas; names are final)
| Tool | Input | Output (structuredContent) | UI |
|---|---|---|---|
| `start_checkin` | `participantId`, `slot?: morning\|midday\|evening` (server infers from local time if omitted) | `{sessionId, slot, items:[{itemId,type,prompt,stimuli?,suggestedPhrasing}], participantFacts:{name, yesterdayStory?}, tone}` | inline `ui://lantern/checkin-card` (name, date, lantern glyph; never shows the words) |
| `record_answer` | `sessionId`, `itemId`, `transcript`, `clientTimings?:{startMs,endMs}`, `acoustic?:{rmsDb,f0Median,f0Iqr,wordsPerSec,pauseRatio,syllRate}` | `{score, feedbackPhrasing, nextItem?, done}` | none |
| `finish_checkin` | `sessionId` | `{summary, streakDays, closingPhrasing, alertsEvaluated}` | none |
| `get_trend` | `participantId`, `audience: participant\|caregiver\|clinician`, `days?=90` | per-audience shaped data: participant → `{status:"steady"\|"mixed"\|"talk-to-doctor", words}`; caregiver/clinician → series, EWMA, flags, adherence | inline `ui://lantern/trend-card` |
| `get_doctor_summary` | `participantId` | one-pager data | fullscreen `ui://lantern/doctor-summary` |
| `notify_care_circle` | `participantId`, `kind: digest\|notice\|urgent\|custom`, `message?` | `{delivered:[channel], previewText}` | none |
| `schedule_doctor_visit` | `participantId`, `whenIso`, `withWhom?` | `{icsPath\|icsUrl, emailedTo}` | none |
| `report_concern` | `participantId`, `transcript` | `{level: emergency\|concern\|none, participantPhrasing, caregiverNotified}` | none |
| `enroll_in_study` | `participantId`, `studyCode` | `{study, consentSummary, consentVersion, tiers}` | inline consent card |
| `record_consent` | `participantId`, `studyCode`, `tier`, `assentTranscript`, `proxyName?` | `{enrolled:true, withdrawPhrase}` | none |
| `withdraw_from_study` | `participantId`, `studyCode` | `{withdrawn:true, effective}` | none |
| `export_research_data` | `studyCode`, `format: fhir\|csv`, `since?` | `{path, counts, deidentification:{...}}` | none |
| `get_study_dashboard` | `studyCode` | cohort aggregates | fullscreen `ui://lantern/study-dashboard` |
Resources: `lantern://wordlists`, `lantern://consent/{studyCode}` (text). Prompts: `daily-checkin` (packages the protocol for hosts that support prompts).

### State model (server, SQLite; DynamoDB stretch)
`participants(id, name, birthYear, tz, careCircle[], mode: atRisk|diagnosed|recovery, baseline{domain→μ,σ,r,completedOn})`, `sessions(id, participantId, slot, startedAt, endedAt, weight)`, `observations(id, sessionId, domain, itemId, raw, score, features json, acoustic json)`, `facts(participantId, date, kind: dayStory|event, text, embedding?)`, `wordlistUsage(participantId, listId, usedOn)`, `alerts(id, participantId, level, domains, openedAt, closedAt, notifiedAt)`, `studies`, `enrollments(participantId, studyCode, tier, consentVersion, consentedAt, withdrawnAt)`, `outbox(id, channel, to, subject, body, createdAt)`.
State across sessions is the whole point: `start_checkin` knows yesterday's story, which words were given at 8 am, which lists are burned, the streak, and the baseline.

### Alexa+ response conventions
- `content: [{type:"text", text: JSON.stringify(structuredContent)}]` **and** `structuredContent` (Amazon's example shows both).
- `_meta.ui = { resourceUri, invoking: "Checking in…", invoked: "Here's your morning" }` (field names from Amazon's lifecycle doc).
- Views declared via `@modelcontextprotocol/ext-apps/server` (`registerAppTool`/`registerAppResource`) so MCP-Apps-aware hosts see `ui://` resources; mime `text/html;profile=mcp-app` (verify in ext-apps README — Sonnet: read the package README before coding).
- Friction-log item (gold for product feedback): Amazon's lifecycle example sends `protocolVersion: "2025-03-26"` while the toolkit page says 2025-11-25 — our server accepts both (SDK negotiates), and we note the inconsistency.

### Agent Skill
`skills/lantern-checkin/SKILL.md` (+ `reference/tone.md`, `reference/safety.md`): tells any agent host (Alexa+, Claude) how to run a micro check-in with the tools: order, one question at a time, never reveal the words on screen, tone rules, emergency rule, what to do when the participant goes off-topic (answer, then gently return once; if they decline, `finish_checkin` with what you have). This is the "Agent Skill" deliverable and also what Claude Desktop uses in the demo.

### Ring
**Dropped.** No cheap, story-positive hook; "front door" doesn't help a memory-measurement story and a Ring simulator costs hours. One line in "future": Ring events as context ("you went out at 10") only with separate consent.

---

## 9. Validation plan (what is and isn't validated — say this out loud)

Not validated: all thresholds, the autobiographical-consistency and story-repetition measures, the acoustic proxies, the LLM scoring. Validated *constructs* we borrow: delayed word recall, category fluency, orientation, high-frequency burst sampling, within-person variability.
1. **Phase 0 feasibility** (n≈30, 60+, 4 weeks): adherence (target ≥ 80%, M2C2 got 89%), acceptability interviews, ASR error audit on older voices, scoring agreement (LLM judge vs two human raters, κ ≥ 0.8).
2. **Phase 1 convergent validity** (n≈150): 14-day Lantern aggregates vs a standard neuropsych battery and vs ARC/M2C2 in the same people; 7-day aggregate test-retest ICC target ≥ 0.8 (ARC's bar); practice-effect curve across parallel forms; set EWMA thresholds from empirical false-alarm rates.
3. **Phase 2 longitudinal** (n≈500, 2–3 yrs, in an existing biomarker cohort): do personal-drift flags precede clinical progression / track plasma p-tau217 or amyloid status? Pre-registered.
4. **Regulatory**: stays a general-wellness/research tool; any claim of "detects MCI" would make it SaMD and require FDA review — out of scope and stated.
5. IRB approval before any human data; HIPAA business-associate posture if deployed with clinics.

---

## 10. Technical architecture

- **Language/stack**: TypeScript, Node 22+, npm workspaces: `packages/shared` (types, scoring, stats, wordlists), `packages/server` (MCP server + HTTP API + storage), `packages/sim` (Vite + React Echo-Show simulator, real MCP client), `packages/views` (MCP App HTML views, built to single files, served as `ui://` resources), `skills/`, `infra/`, `docs/`, `scripts/`.
- **MCP**: `@modelcontextprotocol/sdk@1.32.1` (`LATEST_PROTOCOL_VERSION = '2025-11-25'`, verified in package), `McpServer` + `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined` (stateless; every request self-contained — Lambda-friendly) and `enableJsonResponse: true` by default (SSE optional via env). `@modelcontextprotocol/ext-apps@1.7.5` (peer sdk ^1.29 — compatible) for views; host side in sim uses `@modelcontextprotocol/ext-apps/app-bridge`. Fallback if AppBridge fights us: sandboxed `iframe srcdoc` + a `postMessage({type:"lantern:data", structuredContent})` shim — views check for both.
- **Server HTTP**: Express. Routes: `POST/GET/DELETE /mcp` (MCP), `POST /api/brain` (LLM orchestrator for the sim; server holds AWS creds), `GET /api/outbox`, `GET /exports/*`, `GET /health`. CORS open for localhost sim.
- **Storage**: `better-sqlite3@13` (`data/lantern.db`, WAL). `Repo` interface; `DynamoRepo` single-table = stretch.
- **LLM ("Alexa brain" in the sim and scoring judge)**: `LLM_PROVIDER=mock|bedrock`. Bedrock via `@aws-sdk/client-bedrock-runtime` Converse API, model `us.amazon.nova-2-lite-v1:0` (fallback `anthropic.claude-*` on Bedrock if Nova unavailable in region). Tool definitions passed to Converse come straight from `tools/list` (so the brain only knows what MCP exposes — honest architecture). Mock provider = deterministic orchestrator that follows `items[]` from `start_checkin`, uses `suggestedPhrasing`, and scores with keyword overlap. **The demo must run perfectly in mock mode**; Bedrock is upside.
- **Speech in sim**: `webkitSpeechRecognition` (Chrome) for mic → transcript with `startMs/endMs`; `speechSynthesis` for Alexa voice (Ben's call; see §12). Text input always available. Tier B features from `AudioContext` + `AnalyserNode` while the mic is open; `pitchy` for F0 (or a 40-line autocorrelation). Only numbers sent.
- **Simulator look**: Echo Show 8 bezel (1280×800 canvas scaled), ambient home screen, blue listening bar, transcript ribbon, inline card slot (≈ 60% width), fullscreen mode, a developer drawer showing live JSON-RPC (initialize / tools/list / tools/call) — this is the "it's a real MCP client" proof shot. Visual language: warm paper (#F6F1E7) / ink (#1E2A32) / lantern amber (#E8A33D) / calm teal for "steady" (#2B7A78); type: big (min 22 px on device), high contrast (≥ 7:1), one display face (e.g., "Fraunces") + one UI face ("Inter"); no gradients, no glassmorphism, no emoji.
- **AWS (Builder mini, documented in README `## AWS integration`)**: Bedrock (Nova 2 Lite) for orchestration + scoring judge + concern classifier; **SES** for digest/alert email (sandbox: verified address only — file outbox fallback); **Lambda Function URL** running the same Express app via **AWS Lambda Web Adapter** (no code changes; stateless MCP) — SQLite on `/tmp` is ephemeral, so Lambda demo uses the seeded read-mostly DB bundled in the image or DynamoDB (stretch). SNS SMS optional. Everything behind env flags; `npm run dev` needs zero AWS.
- **One command**: `npm install && npm run seed && npm run dev` → server :8787, sim :5173. `npm run inspector` opens `@modelcontextprotocol/inspector` pointed at `/mcp`. `npm run demo` resets DB to Rose day 91.
- **Claude Desktop / Claude Code**: `claude mcp add --transport http lantern http://localhost:8787/mcp` and a `claude_desktop_config.json` snippet using `mcp-remote` for the video "same server, different host" shot.
- **License**: MIT. Repo under `github.com/swellstackco/lantern` (Ben decides).

---

## 11. Devpost description draft + product-feedback skeleton

**Title**: Lantern — early light on memory and speech change, through everyday talk with Alexa+
**Tagline**: A consented, research-grade early-warning instrument that lives in the smart speaker you already own.
**Inspiration** (3 lines): families notice change months late; clinic tests once a year with practice effects; NIA-funded burst studies (M2C2, ARC) show short frequent remote tests work — but need an app and finger taps. Alexa+ already talks with 60-year-olds every morning.
**What it does**: three ≤45 s moments a day … personal baseline … EWMA drift … care-circle digest/alert … doctor one-pager … consented de-identified FHIR/CSV export … study dashboard.
**How we built it**: TS, MCP SDK 1.32.1 (spec 2025-11-25, Streamable HTTP), MCP Apps views, Agent Skill, Bedrock Nova 2 Lite, SES, Lambda Function URL; simulator is a real MCP client over Streamable HTTP; Claude Desktop calls the same server.
**What's not validated**: paragraph from §9. **Safety**: paragraph from §5.
**Tracks**: Alexa+ (primary), AWS Builder, Open Source (MIT, new project).

**Product feedback — note while building (Amazon weights this; friction logs give up to +10%)**. For each: used for / worked / needs work / onboarding / build again?
- Alexa+ MCP Toolkit docs: no hackathon access to toolkit/simulator (FAQ) → we built our own; `protocolVersion` mismatch between lifecycle example (2025-03-26) and toolkit page (2025-11-25); `_meta.ui` fields documented in prose but no JSON schema; no stated payload limits/timeouts; design guide lacks token values (contrast, min type) even though it promises them.
- **Feature request (critical for this category)**: a *consented acoustic-features API* — Alexa+ already has the audio; expose derived, privacy-preserving per-utterance numbers (F0 median/IQR, RMS, speaking rate, pause ratio) in `tools/call` `_meta` for add-ons the customer explicitly opts into. Without it, voice-change signals (Parkinson's, ALS, stroke) are impossible on-platform. Severity: critical for health add-ons. Also: client timings (`startMs/endMs`) per utterance; a scheduled-proactive-prompt capability (morning/midday/evening nudges initiated by the add-on); a per-customer stable pseudonymous ID in `_meta`.
- MCP TS SDK: Streamable HTTP + stateless mode worked; note any typing friction with `structuredContent` + `outputSchema`.
- ext-apps: README gaps, host-side AppBridge friction, mime type naming.
- Bedrock Converse + Nova 2 Lite: tool-use quality, latency, region/profile ID confusion (`amazon.nova-2-lite-v1:0` vs `us.` profile).
- SES sandbox, Lambda Web Adapter + Function URL streaming limits, Inspector behavior with 2025-11-25.

---

## 12. Decisions Ben must make tonight (with recommendations)

1. **Name**: Lantern (recommend) / Hearth / keep Baseline. → *Lantern.*
2. **AWS account + billing on**: needed for Bedrock (Nova 2 Lite enabled in us-east-1), SES (verify one sender/recipient), Lambda. Expected spend < $5. → *Yes, use Ben's own AWS (not a client's). If no AWS by Oct 22 noon Manila, ship mock mode and drop AWS mini.*
3. **Public repo**: `github.com/swellstackco/lantern`, MIT, created at submit time (Ben creates; agents don't). → *Yes.*
4. **Alexa voice in the sim**: browser `speechSynthesis` (en-US female voice) — not AI-generated audio in Ben's sense; it's the browser's built-in TTS. → *Recommend yes; it makes the live check-in land. If Ben objects, captions-only with chime.*
5. **Narration**: Ben records (rule). Script in VIDEO-SCRIPT.md. → *Ben.*
6. **Demo persona name**: "Rose Alvarez, 68, retired teacher, Tucson; daughter Maya in Seattle" (all fictional). → *OK unless Ben wants different.*
7. **Tier B acoustic panel**: in scope above the cut line (3 h) — see BUILD-PLAN. → *Keep unless T1–T9 slip past Oct 23 09:00 Manila.*

---

## 13. Honest odds

~60k registrants; realistically a few hundred Alexa+ submissions, most "MCP wrapper around an API." A polished measurement product with a research story, real MCP Apps, a Skill, AWS pipeline and a tight video is top-10 material; winning depends on the video and on judges buying the health angle (one judge is Alexa SA; health is a long-standing Alexa priority). Biggest risks: (1) simulator feels fake — fix with the live JSON-RPC drawer and Claude Desktop shot; (2) too much scope — the cut line exists for this; (3) judges distrust health claims — fix with the validation section and the disclaimer on screen.
