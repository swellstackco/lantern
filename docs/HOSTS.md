# Using Lantern from different hosts

Same server, different hosts. Start it first:

```
npm install && npm run demo && npm run dev
```

The MCP endpoint is `http://localhost:8787/mcp` (Streamable HTTP, protocol 2025-11-25; 2025-03-26 also accepted). It is stateless: every request is self-contained.

## The simulator (default)

Open http://localhost:5173. It is a real MCP client (the TypeScript SDK `Client` over Streamable HTTP). The JSON-RPC tab shows every message.

## Claude Code

```
claude mcp add --transport http lantern http://localhost:8787/mcp
```

Then ask: "Use Lantern to get the caregiver trend for Rose." Claude Code calls `get_trend` with `participantId: "rose"`. To use the Agent Skill, copy it into your skills folder:

```
cp -r skills/lantern-checkin ~/.claude/skills/
```

## Claude Desktop

Claude Desktop reaches a local HTTP server through `mcp-remote`. Add this to `claude_desktop_config.json` (Settings, Developer, Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "lantern": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/mcp"]
    }
  }
}
```

Install the skill by zipping `skills/lantern-checkin` and uploading it in Settings, Capabilities, Skills. Then say "Run a Lantern check-in for Rose".

## MCP Inspector

```
npm run inspector
```

or from a terminal, without the browser UI:

```
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --transport http --method tools/list
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --transport http --method tools/call --tool-name get_trend --tool-arg participantId=rose --tool-arg audience=participant
```

Both were run against this server (13 tools listed; `get_trend` returned Rose's gentle status).

## Alexa+

Alexa+ add-ons receive text only, so the Tier B voice features cannot reach the server there; see docs/FEEDBACK-LOG.md. Hackathon participants do not get the Alexa+ MCP toolkit or simulator, so the simulator in this repo stands in for it.

## curl

`npm run smoke` runs initialize (both protocol versions), tools/list, and a full morning, midday, evening run.
