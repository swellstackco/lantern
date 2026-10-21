import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../paths.js";
import { UI } from "./ui.js";

const FILES: Record<string, { file: string; title: string }> = {
  [UI.checkin]: { file: "checkin-card", title: "Check-in card" },
  [UI.trend]: { file: "trend-card", title: "Trend card" },
  [UI.doctor]: { file: "doctor-summary", title: "Doctor summary" },
  [UI.dashboard]: { file: "study-dashboard", title: "Study dashboard" },
  [UI.consent]: { file: "consent-card", title: "Consent card" },
};
const FALLBACK = `<!doctype html><meta charset="utf-8"><body style="font:20px system-ui;padding:24px">Lantern views are not built yet. Run <code>npm run build</code>.</body>`;

export function viewHtml(file: string): string {
  const p = join(ROOT, "packages", "views", "dist", "views", `${file}.html`);
  return existsSync(p) ? readFileSync(p, "utf8") : FALLBACK;
}

/** Registers the ui:// resources (MIME text/html;profile=mcp-app) that tools point at through _meta.ui.resourceUri. */
export function registerViews(server: McpServer) {
  for (const [uri, v] of Object.entries(FILES)) {
    registerAppResource(server, v.title, uri, { description: `${v.title} (MCP App view)`, mimeType: RESOURCE_MIME_TYPE },
      async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: viewHtml(v.file) }] }));
  }
}
