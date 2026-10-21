# Friction log

Each entry: task, steps, expected vs. actual, severity, workaround, suggestion. Raw notes are in FEEDBACK-LOG.md.

## 1. Test an Alexa+ add-on without the Alexa+ toolkit simulator
- **Task:** see how our MCP server's tools and cards behave inside Alexa+.
- **Steps:** read the Alexa+ MCP docs and the hackathon FAQ; looked for a simulator or test console.
- **Expected:** a test console or simulator for registered hackathon participants.
- **Actual:** the FAQ says participants do not get Alexa+ toolkit access.
- **Severity:** high.
- **Workaround:** built our own Echo-Show-style web simulator that is a real MCP client (initialize, tools/list, tools/call) over Streamable HTTP.
- **Suggestion:** give hackathon entrants time-boxed simulator access, or publish a reference MCP client that mimics Alexa+ card sizing and `_meta.ui` handling.

## 2. Measure voice change (Parkinson's, ALS, stroke signs) in a health add-on
- **Task:** read pitch range, speaking rate and pauses from what the person says.
- **Steps:** checked the `tools/call` payload and `_meta` in the Alexa+ MCP docs.
- **Expected:** some derived, consented acoustic numbers, or at least utterance timings.
- **Actual:** add-ons receive text only. No timing, loudness or pitch.
- **Severity:** critical for health add-ons.
- **Workaround:** computed the features in the browser simulator (numbers only, no audio stored) and labeled them "simulator only".
- **Suggestion:** a consented acoustic-features field in `_meta` (F0 median and IQR, loudness, speaking rate, pause ratio, start/end ms) for add-ons the customer opts into.

## 3. Pick the MCP protocol version
- **Task:** set `protocolVersion` on `initialize`.
- **Steps:** compared the Alexa+ lifecycle example with the toolkit page.
- **Expected:** one stated version.
- **Actual:** the lifecycle example uses `2025-03-26`; the toolkit page says `2025-11-25`.
- **Severity:** medium.
- **Workaround:** the server accepts both; both verified by curl and tests.
- **Suggestion:** state one supported version (and the accepted range) in one place.

## 4. Declare UI cards for tools (`_meta.ui`)
- **Task:** attach a `ui://` view to each tool, with Amazon's `invoking`/`invoked` strings.
- **Steps:** tried `registerAppTool` from `@modelcontextprotocol/ext-apps`.
- **Expected:** the helper's types to include Amazon's fields.
- **Actual:** `McpUiToolMeta` has no `invoking`/`invoked`; the `_meta.ui` shape is described in prose only.
- **Severity:** low.
- **Workaround:** plain `registerTool` with a hand-written `_meta.ui` object (the SDK passes `_meta` through unchanged in `tools/list`).
- **Suggestion:** publish a JSON schema for `_meta.ui` and align the ext-apps types with the Alexa+ docs.

## 5. Run a stateless Streamable HTTP server with the MCP TypeScript SDK
- **Task:** one `McpServer` + transport per POST, no sessions.
- **Steps:** `sessionIdGenerator: undefined`, then tested GET and DELETE on `/mcp`.
- **Expected:** the SDK to answer GET/DELETE correctly in stateless mode.
- **Actual:** no built-in handling; we had to return 405 ourselves.
- **Severity:** low.
- **Workaround:** small Express handlers for GET/DELETE.
- **Suggestion:** a one-line `statelessHandler` helper in the SDK.

## 6. Return structured tool results
- **Task:** return `structuredContent` with extra fields.
- **Steps:** registered tools with an `outputSchema`.
- **Expected:** loose objects to pass.
- **Actual:** every call is validated strictly against `outputSchema`, so extra fields error at runtime.
- **Severity:** low.
- **Workaround:** `z.object(...).passthrough()`.
- **Suggestion:** call this out in the SDK docs next to `outputSchema`.

## 7. Know the limits
- **Task:** size tool results and cards for Alexa+.
- **Steps:** searched the docs for payload size and timeout limits.
- **Expected:** a limits table.
- **Actual:** none stated.
- **Severity:** medium.
- **Workaround:** kept results small and cards light.
- **Suggestion:** a one-line limits table per call type.

## 8. Build the views (tooling, not Amazon-specific)
- **Task:** build React views as single-file MCP Apps.
- **Steps:** Vite 7 + @vitejs/plugin-react 5 + vite-plugin-singlefile.
- **Expected:** a clean build.
- **Actual:** "Missing field moduleType" on every .tsx request; repeated "Unknown output options: codeSplitting" warnings.
- **Severity:** low.
- **Workaround:** dropped the React plugin and used esbuild's automatic JSX.
- **Suggestion:** pin compatible versions in the MCP Apps starter.
