import express from "express";
import cors from "cors";
import { PRODUCT } from "@lantern/shared";
import { SqliteRepo } from "./storage/sqlite.js";
import type { Repo } from "./storage/repo.js";
import { DB_PATH, EXPORTS_PATH } from "./paths.js";
import { getBrain } from "./brain/index.js";
import { mountMcp } from "./mcp/http.js";

export function createApp(repo: Repo) {
  const app = express();
  app.use(cors({ exposedHeaders: ["Mcp-Session-Id"] }));
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, name: PRODUCT.name, protocol: PRODUCT.protocolVersion }));
  app.use("/exports", express.static(EXPORTS_PATH));
  app.get("/api/outbox", (_req, res) => res.json(repo.listOutbox(100)));
  app.post("/api/brain", async (req, res) => {
    try { res.json(await getBrain().step(req.body)); } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  mountMcp(app, repo);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? PRODUCT.port);
  const repo = new SqliteRepo(DB_PATH);
  if (!repo.listParticipants().length) console.warn("No data yet. Run: npm run demo");
  createApp(repo).listen(port, () => console.log(`${PRODUCT.name} server on http://localhost:${port}  (MCP at /mcp)`));
}
