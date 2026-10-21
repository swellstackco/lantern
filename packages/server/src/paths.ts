import { fileURLToPath } from "node:url";
import { join } from "node:path";
/** Repo root, so the server finds data/ and outbox/ no matter which folder npm runs it from. */
export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const DB_PATH = process.env.LANTERN_DB ?? join(ROOT, "data", "lantern.db");
export const OUTBOX_PATH = process.env.LANTERN_OUTBOX_DIR ?? join(ROOT, "outbox");
export const EXPORTS_PATH = process.env.LANTERN_EXPORTS_DIR ?? join(ROOT, "exports");
