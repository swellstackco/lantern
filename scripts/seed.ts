import { DB_PATH } from "../packages/server/src/paths.js";
import { addDays } from "@lantern/shared";
import { SqliteRepo } from "../packages/server/src/storage/sqlite.js";
import { seedDatabase, ROSE_ID } from "../packages/server/src/seed.js";

const demo = process.argv.includes("--demo");
const dbPath = DB_PATH;
const today = process.env.LANTERN_TODAY ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
import { rmSync } from "node:fs";
import { OUTBOX_PATH } from "../packages/server/src/paths.js";
rmSync(OUTBOX_PATH, { recursive: true, force: true });
const repo = new SqliteRepo(dbPath);
const rows = seedDatabase(repo, today, { outbox: true });
console.log(`\nSeeded ${dbPath}  (90 days ending ${addDays(today, -1)}; today = day 91, morning check-in not done yet)\n`);
console.table(rows);
const rose = rows.find((r) => r.id === ROSE_ID)!;
if (rose.alertDay === null || rose.alertDay < 70 || rose.alertDay > 85) { console.error(`ASSERT FAILED: Rose alert opened on day ${rose.alertDay}, expected 70-85`); process.exit(1); }
const lowAd = rows.find((r) => r.id === "p-11")!;
console.log(`Rose alert opened on day ${rose.alertDay} (expected 70-85). ${demo ? "Demo state ready: Rose has one open notice and no sessions today." : ""}`);
if (lowAd.finalStatus !== "not_enough_data") console.warn("note: low-adherence member status =", lowAd.finalStatus);
repo.close();
