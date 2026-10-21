# Feature requests for Alexa+ add-ons

1. **Consented acoustic-features API (critical for health add-ons).** Alexa+ already has the audio. Expose derived, privacy-preserving per-utterance numbers (F0 median and IQR, loudness, speaking rate, pause ratio) in the `tools/call` `_meta` for add-ons the customer explicitly opts into. Without it, voice-change signals (Parkinson's, ALS, stroke) cannot be measured on-platform. Lantern's simulator computes exactly these six numbers in the browser, so the server side is ready.
2. **Client timings per utterance** (`startMs`, `endMs`). Response latency and speaking duration are standard in cognitive testing.
3. **Add-on initiated prompts.** A scheduled, customer-approved nudge (morning, midday, evening) started by the add-on, not only by the customer.
4. **A stable, per-customer pseudonymous id in `_meta`.** Needed to keep a personal baseline without asking for a name or account.
5. **Payload limits and timeouts, stated.** The docs give none. A one-line limit table per call would help.
6. **One protocol version.** The lifecycle example uses `2025-03-26`; the toolkit page says `2025-11-25`.
7. **A JSON schema for `_meta.ui`** (`resourceUri`, `invoking`, `invoked`). It is described in prose only.
8. **Hackathon access to the MCP toolkit simulator.** The FAQ says participants do not get it, so we built our own client. Access would have let us test the real card sizing.
