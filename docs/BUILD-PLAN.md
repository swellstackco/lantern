# Lantern — Build plan for Sonnet (one builder agent, sequential)

Read `docs/SPEC.md` first. Rules: TypeScript strict, American English, participant-facing text at 4th–6th grade, no emoji, no AI-slop UI (warm paper / ink / amber palette from SPEC §10, big type, 7:1 contrast). Commit after every task with a message `T<n>: <done criterion>`. Stage exact files (no `git add -A` in worktrees). Never call paid generation APIs; Bedrock calls are allowed only behind `LLM_PROVIDER=bedrock` and only once Ben confirms the AWS account (Decision 2). Mock mode must always work.

Clock: start ~Oct 21 23:00 Manila. Hard stop for code: **Oct 23 12:00 Manila** (then video + submission). Estimated 27 h of agent time. Order is priority order — the video needs T1–T9 most.

## Task list

### T1 — Scaffold (1 h)
npm workspaces: `packages/shared`, `packages/server`, `packages/sim`, `packages/views`; root scripts `dev` (concurrently server+sim), `seed`, `demo`, `test`, `inspector`, `build`. tsconfig strict, vitest, eslint minimal, `LICENSE` (MIT), `.env.example` (`LLM_PROVIDER=mock`, `AWS_REGION`, `BEDROCK_MODEL_ID=us.amazon.nova-2-lite-v1:0`, `SES_FROM`, `PORT=8787`), README skeleton with the one-command run and the not-a-medical-device paragraph.
**Done**: `npm install && npm run dev` starts server on :8787 (`/health` returns `{ok:true, protocol:"2025-11-25"}`) and sim on :5173 showing a placeholder frame.

### T2 — Domain, stimuli, scoring (2 h) — `packages/shared`
Types from SPEC §8 state model. `wordlists.ts`: 40 triplets of concrete 1–2 syllable nouns, no semantic overlap within a triplet (hand-write; no copyrighted instrument lists). `categories.ts`: 12 categories with member dictionaries (≥ 60 members each, lowercase, plural/singular normalized). Scoring: `scoreRecall(given, transcript)` (free 0–3, cued +0.5), `scoreFluency(category, transcript)` → `{distinct, repetitions, intrusions}`, `scoreOrientation(truth, transcript)`, `scoreConsistency(prior, now)` keyword-overlap with pluggable `Judge` interface, `storyRepetition(today, priorStories[])`, `languageFeatures(transcript)` (wordCount, ttr, fillers, selfCorrections, meanSentenceLen). Fillers list includes "thing", "stuff", "whatchamacallit", "um", "uh", "you know".
**Done**: `npm test` green with ≥ 25 unit tests covering each scorer incl. misspellings/plurals ("cats"→cat) and intrusions.

### T3 — Storage + statistics + alert engine (2 h) — `packages/server/src/storage`, `packages/shared/src/stats`
SQLite schema (SPEC §8) via `better-sqlite3`, `Repo` interface. Stats: `baseline(obs)`, weighted `ewma(z[], λ=0.2, w[])`, `rci`, `variabilityIndex`, `evaluateAlerts(participant)` with the rule in SPEC §4 (≥ 10 consecutive scored days ≤ −1.0, ≥ 8 obs, ≥ 2 domains or ≤ −1.5 in one; 14-day re-alert suppression; "not enough data" when adherence < 40%). Recovery mode flips sign.
**Done**: tests: (a) synthetic stable series → no alert; (b) one outlier day z=−3 → no alert; (c) 30-day sustained −1.2 drift in 2 domains → alert opens between day 10–14 of the drift; (d) adherence 30% → `not_enough_data`.

### T4 — Seed generator (1.5 h) — `scripts/seed.ts`
Deterministic (seeded RNG). Persona **Rose Alvarez** (fictional, 68, b. 1958, Tucson, tz America/Phoenix, mode atRisk, care circle Maya Alvarez `maya@example.com`), 90 days ending yesterday. Days 1–60 stable (recall μ 2.6 σ 0.5; fluency μ 11 σ 2; consistency μ 1.8; orientation 3; sleep 6.5–7.5; mood 4). Days 61–90 drift: recall → 1.9, consistency → 1.1, fluency → 9.5, story repetition ↑, fillers ↑ (linear ramp + noise). **Day 38 outlier**: sleep 3.5 h, rough day, recall 1, fluency 6 → weight 0.5, must not alert. Adherence ~85% (random skipped slots), day stories from a bank of 40 plain-language fictional day summaries (granddaughter's science fair, church bake sale, garden, neighbor's dog…). Tier B acoustic per session: f0Iqr stable ~45 Hz then narrowing to ~30 Hz over days 61–90, rate stable (so acoustic shows a *different* story than text; good for demo — label "experimental"). Also seed 11 more synthetic cohort members (7 stable, 2 drift, 1 recovery, 1 low adherence) enrolled in `LANTERN-PILOT`, Rose enrolled Tier 2. Print a summary table and assert the alert opened on day 70–85.
**Done**: `npm run seed` prints table; `npm run demo` = seed + set "today" = day 91 with morning session not yet done.

### T5 — MCP server (3 h) — `packages/server/src/mcp`
`McpServer` from `@modelcontextprotocol/sdk@1.32.1`; `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: process.env.MCP_SSE !== "1" })` mounted at `/mcp` (POST/GET/DELETE). Register all 13 tools from SPEC §8 with zod input schemas, `outputSchema`, descriptions written per Amazon rules (when/why/what it returns), returning `content[0].text = JSON.stringify(structuredContent)` + `structuredContent` + `_meta.ui` where a view applies. Resources `lantern://wordlists`, `lantern://consent/{studyCode}`; prompt `daily-checkin`. `start_checkin` picks slot, burns a word triplet, builds items with `suggestedPhrasing`, includes `yesterdayStory` when scheduled. `record_answer` scores (Judge = mock unless bedrock), stores, returns next. `finish_checkin` updates baseline/EWMA/alerts and, on `notice`, enqueues outbox digest. `report_concern` keyword classifier (face/droop/arm/weak/numb/speech/slur/fell/fall/confused/lost) → `emergency` phrasing per SPEC §5. `scripts/smoke.sh`: curl `initialize` (both `2025-11-25` and `2025-03-26` must succeed), `tools/list` (13 tools), `tools/call start_checkin`.
**Done**: `npm run inspector` lists 13 tools; `scripts/smoke.sh` passes; a full morning→midday→evening run via curl produces 3 sessions for Rose.

### T6 — MCP App views (2.5 h) — `packages/views`
Vanilla TS + `@modelcontextprotocol/ext-apps` (`App` class) built by Vite to single-file HTML (inline CSS/JS), registered on the server via `registerAppResource`/`registerAppTool` from `@modelcontextprotocol/ext-apps/server` (read the package README first; note mime type). Views: `checkin-card` (inline: "Good morning, Rose", date, lantern glyph, streak; never shows words), `trend-card` (inline, caregiver/clinician: 3 sparklines with baseline band + EWMA, adherence, status pill; participant audience → words-only variant), `doctor-summary` (fullscreen, print CSS: 90-day charts, RCI table, flagged window, sleep overlay, disclaimer, "what Lantern does not measure"), `study-dashboard` (fullscreen: n, adherence histogram, pseudonymous sparklines, flags, export buttons that call `export_research_data` through the host). Charts: hand-rolled SVG (no chart lib) following SPEC palette; large type. Each view also accepts the `postMessage` shim fallback.
**Done**: each view renders from a fixture JSON opened directly in a browser; server `resources/read ui://lantern/trend-card` returns the HTML.

### T7 — Simulator shell + mock brain (3 h) — `packages/sim`
Echo Show 8 frame, ambient home (time, "Tuesday, October 22"), listening bar, transcript ribbon (Alexa left, Rose right, big type), inline card slot, fullscreen mode, developer drawer (live JSON-RPC log: every request/response with timing). MCP client = `Client` + `StreamableHTTPClientTransport` from the sdk (browser). Input: text box always; mic via `webkitSpeechRecognition` with `startMs/endMs`; output via `speechSynthesis` (toggle). Brain abstraction `POST /api/brain` with `{history, toolsFromList}` → `{say, toolCalls[]}`; **mock provider** on the server runs the deterministic check-in flow from `start_checkin` items and `suggestedPhrasing`, handles off-topic ("I'm not sure") gracefully, and ends with `finish_checkin`. Also: "Alexa, how am I doing?" → `get_trend(participant)`; "show Maya the trend" → caregiver card; "show the doctor summary" → fullscreen; "I fell" → `report_concern`.
**Done**: full morning check-in by typing in mock mode, card shows, drawer shows initialize/tools/list/tools/call; recall of yesterday's seeded story works on the midday flow.

### T8 — App-bridge host in sim (2 h)
Render `_meta.ui.resourceUri` results: `resources/read` → sandboxed iframe via `AppBridge` from `@modelcontextprotocol/ext-apps/app-bridge`; pass tool result; support views calling tools (study dashboard export). Fallback shim if AppBridge blocks: `iframe srcdoc` + `postMessage`. Inline vs fullscreen placement per `_meta.ui` or tool name.
**Done**: trend card, doctor summary, study dashboard all render inside the Echo frame with Rose's seeded data.

### T9 — Care circle + agentic chain (1.5 h)
`notify_care_circle` → SES when configured, else writes `outbox/<ts>-<kind>.html`; `GET /api/outbox` lists; sim has an "Outbox" tab that previews the email (this is the caregiver shot in the video). Weekly digest renderer (plain sentence + sparklines as inline SVG). `schedule_doctor_visit` writes `.ics` and emails it. Brain flow: alert `notice` → caregiver prompt "Want me to add a doctor visit?" → yes → ICS + email in one turn (chain visible in the drawer).
**Done**: `npm run demo` state has one open `notice`; asking Alexa "any updates for Maya?" shows the alert card, then "add a visit Friday 10 am" writes `.ics` + outbox email.

### T10 — Research layer (2 h)
`enroll_in_study`, `record_consent`, `withdraw_from_study`, `export_research_data` (FHIR Bundle + CSV + `data_dictionary.csv`, de-identification per SPEC §5 incl. date shift, HMAC codes, age bucket, NER strip for Tier 2 transcripts), consent card view, study dashboard wired to live data. `docs/RESEARCH.md`: measures table, stats method, consent model, de-id, export schema, validation plan (copy from SPEC §1,2,4,5,6,9 — this is the file a researcher reads).
**Done**: `exports/LANTERN-PILOT.fhir.json` validates as JSON with ≥ 1,000 Observations and no names/dates unshifted (grep test); CSV opens; withdraw excludes a participant from the next export; dashboard shows 12 participants.

### T11 — Tier B acoustic module (3 h) — **above the cut line only while on schedule** (see below)
`packages/sim/src/acoustic.ts`: while mic is open, `AudioContext` + `AnalyserNode` (2048 FFT, 50 ms hop): RMS dB, voiced frames (RMS > threshold), F0 via `pitchy` (or 40-line autocorrelation, 75–400 Hz), F0 median + IQR over voiced frames, pause ratio and mean pause, speaking rate = ASR words ÷ voiced seconds, syllable-rate proxy from envelope peaks. Emit `{rmsDb,f0Median,f0Iqr,wordsPerSec,pauseRatio,syllRate}` with `record_answer`. Server stores `acoustic` and runs EWMA on `f0Iqr` and `wordsPerSec` ("experimental"). Sudden single-session large drop (rate z ≤ −3 *and* syllRate z ≤ −3) → `report_concern` path. Clinician trend card gets a 4th "Voice (experimental, simulator only)" sparkline; doctor summary adds a short section. A small live meter in the sim (pitch range bar, pause ratio) during speech.
**Done**: speaking into the sim produces non-zero features in the drawer; seeded Rose shows pitch-range narrowing on the clinician card; a unit test on a synthetic sine sweep returns F0 within 5%.

### T12 — Bedrock provider (1.5 h) — needs Decision 2
`/api/brain` provider `bedrock`: Converse API with `toolConfig` derived from `tools/list` (JSON schema pass-through), system prompt = SKILL.md tone/safety + Alexa+ "weave data, don't read JSON" guidance; loop tool calls through the MCP client (brain returns toolCalls, sim executes, sends results back, up to 4 hops). Judge + concern classifier via the same provider. Timeouts 8 s, fallback to mock on error (logged in drawer as "fallback").
**Done**: with creds, the morning check-in runs end-to-end on Nova 2 Lite; `docs/AWS.md` documents the integration (Builder mini requirement).

### T13 — Agent Skill + Claude Desktop (1 h)
`skills/lantern-checkin/SKILL.md` (frontmatter name/description; protocol, tone, safety, examples, tool order), `skills/lantern-checkin/reference/{tone,safety}.md`. `docs/HOSTS.md`: `claude mcp add --transport http lantern http://localhost:8787/mcp`, Claude Desktop `mcp-remote` snippet, Inspector command. Test: Claude Code calls `get_trend` for Rose.
**Done**: screenshot-able Claude Code/Desktop session calling the server saved to `docs/assets/`.

### T14 — Lambda deploy (2 h) — needs Decision 2; stretch
`infra/`: Dockerfile (node 22 + Lambda Web Adapter layer or `public.ecr.aws/awsguru/aws-lambda-adapter`), seeded DB baked into image (read-mostly demo), `deploy.sh` (ECR push, Lambda create/update, Function URL auth NONE), `MCP_SSE=0`. SES send from Lambda role.
**Done**: `curl -X POST <function-url>/mcp` initialize + `tools/list` succeed; URL recorded in `docs/AWS.md`.

### T15 — Polish, README, feedback log (2 h)
Design pass on sim + views (spacing, type scale, contrast check, no scroll inside cards), accessibility (focus states, 44 px targets), `README.md` (what/why/run/architecture diagram as ASCII or SVG/tracks/AWS/safety/license), `docs/FEEDBACK.md` friction log filled from notes kept during T5–T14 (task, steps, expected vs actual, severity, workaround, suggestion), `docs/FEATURE-REQUESTS.md` (acoustic-features API = critical; proactive prompts; client timings; stable pseudonymous ID).
**Done**: README run instructions verified from a clean clone; feedback log has ≥ 8 entries.

### T16 — Demo rehearsal (1 h)
`npm run demo` resets state; `docs/DEMO-RUNBOOK.md` with the exact clicks/utterances in VIDEO-SCRIPT order; fixture "today" pinned so dates match; verify every shot renders in < 2 s. Record screen captures at 1920×1080 (Ben records narration separately).
**Done**: Fable reviews a dry run (screenshots) before Ben records.

## Cut line (drop in this order if behind)
1. **T14 Lambda** (AWS mini still satisfied by Bedrock + SES, documented).
2. **T11 Tier B acoustic** — keep the *feature request* and the seeded clinician sparkline (cheap) and drop live mic features.
3. **T10 study dashboard view** (keep export + consent tools).
4. **T8 AppBridge** → use the postMessage shim only.
5. **T9 ICS calendar** (keep outbox email).
Never cut: T1–T7, T13 (Skill is a track requirement), T15 README/feedback.

Schedule check: if T1–T7 are not done by **Oct 22 18:00 Manila**, apply cuts 1–3 immediately.

## Smoke test checklist (run before the video and before submit)
- [ ] Clean clone: `npm install && npm run demo && npm run dev` works on macOS with Node 22; no AWS env.
- [ ] `/health` reports protocol `2025-11-25`; `initialize` also accepts `2025-03-26`.
- [ ] `tools/list` = 13 tools, each with description + inputSchema + outputSchema.
- [ ] Inspector connects over Streamable HTTP and calls `get_trend`.
- [ ] Sim: morning check-in by voice (Chrome) and by text; words never shown on screen; recall of yesterday's story at midday; wrong answer handled kindly.
- [ ] Drawer shows raw JSON-RPC for initialize, tools/list, tools/call.
- [ ] Day 38 outlier visible on clinician chart with no alert marker; alert marker in days 70–85.
- [ ] Caregiver outbox email renders; doctor one-pager fullscreen + print preview; study dashboard loads 12; export files written and de-identified (grep for "Rose", "Alvarez", "Tucson" = 0 hits).
- [ ] "I fell and my face feels numb" → emergency phrasing + urgent outbox email.
- [ ] Withdraw → next export excludes participant.
- [ ] Claude Code/Desktop calls the same server (screenshot).
- [ ] (If AWS) Bedrock run + Function URL curl recorded in `docs/AWS.md`.
- [ ] README disclaimer present; LICENSE present; no real names/emails anywhere (`git grep -i honolulu` = 0).
