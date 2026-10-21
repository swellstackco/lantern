# Build notes

## Decisions from Ben (applied)
- Name: Lantern (final; one constant in packages/shared/src/config.ts).
- No AWS at all: no Bedrock, SES, Lambda, DynamoDB. T12 and T14 dropped. Brain = mock/scripted by default behind a provider interface. Caregiver alerts go to the local outbox (UI + files).
- Public repo github.com/swellstackco/lantern (MIT, LICENSE present). Ben creates the remote at submit time.
- Browser speechSynthesis for the simulator voice is OK.

## Spec calls
- Drift rule (SPEC section 4 literal: EWMA <= -1.0 for 10 consecutive days) cannot fire sooner than drift day 18 even for a constant -1.2 shift, which contradicts T3 test (c) (days 10-14). Call made: a domain qualifies when its EWMA stayed <= -0.5 for 10+ consecutive scored days (>= 8 obs) AND is <= -1.0 today. Notice = 2+ domains, or 1 domain at <= -1.5. Watch = 1 domain. One outlier day (z=-3) still cannot qualify.
- Baseline split-half r is floored at 0.5 (within-person split-half of a stable series is near zero); placeholder until validation data.

## Status
| Task | State |
|---|---|
| T1 scaffold, T2 scorers, T3 storage/stats/alerts, T4 seed | done |
| T5 MCP server (13 tools) | done |
| T6 MCP App views | done (5 views) |
| T7 simulator + mock brain | done |
| T10 research export + consent + withdraw + docs/RESEARCH.md | done (de-identified FHIR and CSV, dashboard Export button works in the simulator) |
| T9 digest + notice email with sparklines, ICS + outbox chain | done |
| T11 Tier B acoustics | done: DSP (F0, pitch range, pauses, rate, syllable proxy) unit-tested on synthetic signals; live meter and mic capture wired but only exercised by unit tests, never with a real mic in this build; sudden-drop safety path tested; Rose has seeded voice narrowing |
| T13 Skill + HOSTS.md | done; Inspector CLI verified; Claude Code and Claude Desktop steps documented but NOT run (it would edit Ben's own config) |
| T8 AppBridge | NOT done. Views are delivered by the postMessage shim and call tools through a small postMessage bridge (`lantern:call`, `lantern:ack`, `lantern:result`). The views also use the real `App` class when a real MCP Apps host is present. |
| T15 README, feedback log (11 entries), FEATURE-REQUESTS | done; verified from a fresh clone (install, demo, dev, smoke, 98 tests) |
| T12, T14 | dropped (no AWS) |
| T16 runbook | not done (`scripts/e2e-video.mjs` already walks the full path and checks each beat) |

## Video path (docs/VIDEO-SCRIPT.md)
`node scripts/e2e-video.mjs <dir>` (server and simulator running, after `npm run demo`) walks every beat in the simulator and prints VIDEO PATH OK: morning check-in (words hidden on screen), midday (apple, candle, river; animals; yesterday's science fair story), JSON-RPC drawer, "show Maya how Mom's doing" with the 90-day chart (day 38 ring, flag marker), "Friday ten" (ICS + outbox email), doctor summary, voice sparkline (say "show the voice trend"), study dashboard with 12 people and Export FHIR, consent card, "I fell and my face feels numb" with urgent email. Run `npm run demo` again before each take, because smoke tests and takes change today's state.

Shots that cannot be done from this repo alone:
- 2:30 Claude Desktop or Claude Code calling `get_trend` beside SKILL.md: needs Ben to add the server to his own config (steps in docs/HOSTS.md).
- The live mic check-in and the live voice meter: need Chrome with mic permission and a human voice.
- 1920x1080 screen recording and Ben's narration.
- Script wording to fix while recording: the narration says "thirteen tools, the same server Alexa+ would call"; keep it as "would call". The 2:30 line was already edited to remove AWS.
- Minor: on the 800 px Echo frame the study dashboard list scrolls inside the card (12 rows).

## How to run
`npm install && npm run demo && npm run dev` then open http://localhost:5173. Server on :8787 (`/health`, `/mcp`, `/api/brain`, `/api/outbox`). `npm run smoke` runs curl checks against a running server. `npm run fixtures` writes standalone view pages to packages/views/dist/fixtures/. `node scripts/e2e-sim.mjs <dir>` runs a muted headless pass of the simulator and saves screenshots (needs Chrome and playwright-core).

## Calls made while building
- Seed: drift ramp is front-loaded (exponent 0.7), Rose drift scale 1.4, and per-domain minimum SD floors (DOMAIN_SIGMA_FLOOR) were added, so the flag lands on day 79 and stable cohort members never alert. Sleep/mood live in session context.
- `GET`/`DELETE` on `/mcp` return 405 because the server is stateless (SDK client then skips the standalone SSE stream).
- `alertsEvaluated` in `finish_checkin` is a plain boolean so Alexa never speaks alert details to the participant.
- Mock brain returns `say` (spoken) and `display` (screen). The three words are replaced by dots on screen only.
- Slots: the brain passes a slot for "good morning/afternoon/evening"; otherwise the server infers from local time.
- Participant ids also resolve from first names ("rose").
- Views are served only after `npm run build -w @lantern/views` (the `dev` script does this first).
- @vitejs/plugin-react was dropped (broke on the installed Vite); esbuild JSX is used.
