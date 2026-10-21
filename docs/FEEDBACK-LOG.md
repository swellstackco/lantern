# Product feedback / friction log

Specific, factual notes taken while building. Format: area, what happened, severity, workaround.

1. Node 25 + vitest 5.0.5: engines field is `^22.12 || ^24 || >=26`, so Node 25 prints EBADENGINE warnings (works). Low.
2. MCP TS SDK 1.32.1, stateless Streamable HTTP (`sessionIdGenerator: undefined`): works with a fresh `McpServer` + transport per POST. GET and DELETE on `/mcp` have no built-in stateless handling, so we return 405 ourselves. Severity low. Suggestion: a one-line `statelessHandler` helper in the SDK.
3. MCP TS SDK `registerTool`: `outputSchema` is validated against `structuredContent` on every call, so a loose result needs `z.object(...).passthrough()` to avoid surprise errors. Fine once known, but not obvious from the type docs.
4. MCP TS SDK: `initialize` with `protocolVersion: "2025-03-26"` (the version in Amazon's lifecycle example) is accepted and echoed back; `2025-11-25` is also accepted. Both verified by curl and test. The Alexa+ docs list two different versions (lifecycle example vs toolkit page); one stated version would help.
5. MCP TS SDK: `_meta` passed to `registerTool` is returned unchanged in `tools/list`, which is how we publish `_meta.ui.resourceUri`. Documented only in ext-apps, not in the SDK docs.
6. Alexa+ MCP docs: a tool call carries text only. There is no field for audio timing, loudness, or pitch, so voice-change signals (Parkinson's, ALS, and similar) cannot be measured on-platform. See FEATURE REQUEST in SPEC section 11: a consented acoustic-features API. Severity critical for health add-ons.
7. `@modelcontextprotocol/ext-apps` is Apache-2.0 while this project is MIT. Compatible as a dependency, but worth a note in the README.
8. ext-apps 1.7.5 + vite-plugin-singlefile 2.3.4 + Vite 7: build prints repeated 'Unknown output options: codeSplitting' warnings (plugin targets Vite 8). Output is fine. Low.
9. ext-apps `McpUiToolMeta` types do not include Amazon's `invoking`/`invoked` fields, so we register tools with plain `registerTool` and a hand-written `_meta.ui` instead of `registerAppTool`. Suggestion: align the two docs or add the fields to the type. Low.
10. Tooling: with Vite 7.3.7 (resolved from ^7), @vitejs/plugin-react 5 throws 'Missing field moduleType' from builtin:vite-react-refresh-wrapper on every .tsx request. Workaround: drop the plugin and use esbuild jsx automatic. Low (not Amazon-specific).
