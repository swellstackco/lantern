# Lantern

Early light on memory and speech change, through everyday talk with Alexa.

Lantern turns the smart speaker you already own into a consented, research-grade early-warning instrument. Three short, friendly moments a day. Answers are scored against the person's own baseline. A sustained drift is flagged calmly to family. A one-page summary goes to the doctor. With separate consent, de-identified data can be shared with Alzheimer's research.

Built for the Amazon Developer Hackathon, Alexa+ track. Everything runs on a laptop. No cloud account, no paid API, no real people's data (the demo person, Rose Alvarez, is fictional).

## Run it (one command)

Needs Node 22 or newer.

```
npm install && npm run demo && npm run dev
```

Then open http://localhost:5173. In the simulator, press a quick phrase, or type what Rose says.

- `npm run demo` resets the database to Rose on day 91 (90 days of history, one open flag, morning check-in not done yet).
- `npm run dev` builds the views if needed, then starts the server (http://localhost:8787, MCP at `/mcp`) and the simulator.
- Chrome gives you the mic and the Alexa voice (browser speech). Text input always works.

Try this: "Alexa, good morning", answer a few questions, "Alexa, good afternoon", "Show Maya how Mom's doing", "Friday ten", "Show the doctor summary", "Show the study dashboard" (press Export FHIR), "I fell and my face feels numb". Open the JSON-RPC tab to see the real MCP traffic, and the Outbox tab for the emails Maya would get.

Other commands: `npm test` (98 tests), `npm run smoke` (curl checks against a running server), `npm run inspector`, `npm run fixtures` (standalone view pages in `packages/views/dist/fixtures/`), `node scripts/e2e-video.mjs <dir>` (muted headless walk of the whole demo).

## What is in it

```
 Simulator (browser)                                   Other hosts
 Echo Show frame, mic + speech,        Claude Desktop / Claude Code / Inspector
 JSON-RPC drawer, outbox                              |
        |  Streamable HTTP, MCP 2025-11-25            |
        v                                             v
 +-----------------------------------------------------------+
 | Lantern MCP server (Express, stateless)                    |
 |  13 tools, resources, prompt, ui:// views (MCP Apps)       |
 |  check-in engine -> scorers -> SQLite                      |
 |  baseline, EWMA drift detector, alert + outbox             |
 |  de-identified FHIR / CSV export                           |
 +-----------------------------------------------------------+
        ^
 Mock "Alexa brain" (scripted, deterministic; provider interface for a real LLM later)
```

- **Real MCP**: `@modelcontextprotocol/sdk` 1.32.1, Streamable HTTP, protocol 2025-11-25 (2025-03-26 also accepted), 13 tools each with a description, input schema and output schema. The simulator is a real MCP client over the same transport.
- **MCP Apps views** (`@modelcontextprotocol/ext-apps`): check-in card, trend card, doctor summary (fullscreen, print CSS), study dashboard, consent card, served as `ui://lantern/...` with MIME `text/html;profile=mcp-app`.
- **Agent Skill**: `skills/lantern-checkin/SKILL.md`, for Claude and other agent hosts. See docs/HOSTS.md.
- **Measures**: delayed word recall, category fluency, orientation (all established constructs), plus exploratory autobiographical consistency, story repetition and language features. Voice features (pitch range, rate, pauses) are computed in the browser from the mic, numbers only, labeled experimental.
- **Statistics**: personal baseline from the first 14 scored days, weighted EWMA control chart, Reliable Change Index, one flag per 14 days, never a flag on low adherence. See docs/RESEARCH.md.
- **Research layer**: study codes, versioned consent with two tiers, withdraw by voice, de-identified export (pseudonymous ids, shifted dates, birth year only, scrubbed transcripts for Tier 2 only).

## Tracks

- **Alexa+**: an add-on built the way the Alexa+ MCP docs describe: data not scripts, inline cards, a fullscreen one-pager.
- **Open Source**: MIT licensed, new project, everything in this repo.
- **AWS Builder**: not entered. Lantern uses no AWS service.

## Safety and honesty

Lantern is a wellness and research tool. It does not diagnose, treat, cure, or prevent any disease, and it is not a substitute for a doctor. Changes it flags are reasons to talk to a clinician, not conclusions.

- The person never hears the words "decline" or any condition name. Family hears "may be worth a check-up".
- Anything like a fall, a drooping face, numbness or trouble speaking stops the check-in, tells the person to call 911, and sends the family an urgent note with their exact words. The server also treats a sudden large change in voice in one check-in the same way.
- Not validated: every threshold, the exploratory measures, the voice proxies, and the keyword scoring. docs/RESEARCH.md has the validation plan. Nothing here has been tested on real people.
- All data in this repo is synthetic. Alexa+ add-ons receive text only today, so voice features work only in the simulator; docs/FEATURE-REQUESTS.md asks for a consented acoustic-features API.

## Docs

- docs/SPEC.md: the full design. docs/RESEARCH.md: measures, statistics, consent, export, validation.
- docs/HOSTS.md: Claude Code, Claude Desktop, Inspector. docs/FEEDBACK-LOG.md and docs/FEATURE-REQUESTS.md: product feedback for Amazon.
- docs/BUILD-NOTES.md: status and decisions. docs/VIDEO-SCRIPT.md: the 3-minute demo.

## License

MIT. Note: `@modelcontextprotocol/ext-apps` is Apache-2.0.
