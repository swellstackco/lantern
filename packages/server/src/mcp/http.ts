import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Repo } from "../storage/repo.js";
import { createMcpServer } from "./tools.js";

/** Stateless Streamable HTTP: every request gets its own server + transport. State lives in SQLite. */
export function mountMcp(app: Express, repo: Repo) {
  const enableJsonResponse = process.env.MCP_SSE !== "1";
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer(repo);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("mcp error", e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const notAllowed = (_req: Request, res: Response) =>
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless: use POST." }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
