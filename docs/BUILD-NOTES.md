# Build notes

## Decisions from Ben (applied)
- Name: Lantern (final; one constant in packages/shared/src/config.ts).
- No AWS at all: no Bedrock, SES, Lambda, DynamoDB. T12 and T14 dropped. Brain = mock/scripted by default behind a provider interface. Caregiver alerts go to the local outbox (UI + files).
- Public repo github.com/swellstackco/lantern (MIT, LICENSE present). Ben creates the remote at submit time.
- Browser speechSynthesis for the simulator voice is OK.

## Spec calls
- Drift rule (SPEC section 4 literal: EWMA <= -1.0 for 10 consecutive days) cannot fire sooner than drift day 18 even for a constant -1.2 shift, which contradicts T3 test (c) (days 10-14). Call made: a domain qualifies when its EWMA stayed <= -0.5 for 10+ consecutive scored days (>= 8 obs) AND is <= -1.0 today. Notice = 2+ domains, or 1 domain at <= -1.5. Watch = 1 domain. One outlier day (z=-3) still cannot qualify.
- Baseline split-half r is floored at 0.5 (within-person split-half of a stable series is near zero); placeholder until validation data.

## Status (T1 to T7)
- T1 scaffold: done. T2 shared scorers: done (37 tests). T3 storage, stats, alert engine: done. T4 seed (Rose + 11 cohort): done. T5 MCP server (13 tools): done. T6 MCP App views: done (5 views, single-file HTML, fixtures via `npm run fixtures`). T7 simulator + mock brain: done (shim delivery; real AppBridge is T8).
- Not built yet: T8 AppBridge host, T9 weekly digest renderer + sim polish (ICS + outbox email chain already works), T10 research export (tool registered, returns "built in T10"), T11 Tier B live mic features, T13 Skill + HOSTS docs, T15/T16 polish and runbook. T12 and T14 dropped (no AWS).

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
