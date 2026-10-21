import express from "express";
import cors from "cors";
import { PRODUCT } from "@lantern/shared";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, name: PRODUCT.name, protocol: PRODUCT.protocolVersion }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? PRODUCT.port);
  createApp().listen(port, () => console.log(`${PRODUCT.name} server on http://localhost:${port}`));
}
