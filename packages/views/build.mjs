import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { statSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const names = ["checkin-card", "trend-card", "doctor-summary", "study-dashboard", "consent-card"];
const force = process.argv.includes("--force");
const newest = (dir) => readdirSync(dir).reduce((m, f) => Math.max(m, statSync(join(dir, f)).mtimeMs), 0);
const srcTime = Math.max(newest(join(root, "src")), newest(join(root, "views")));
const stale = names.some((n) => { const f = join(root, "dist", "views", `${n}.html`); return !existsSync(f) || statSync(f).mtimeMs < srcTime; });
if (!force && !stale) { console.log("views up to date"); process.exit(0); }
for (const n of names) {
  await build({
    root, logLevel: "warn", configFile: false, plugins: [viteSingleFile()],
    build: { outDir: "dist", emptyOutDir: false, minify: true, target: "es2022", rollupOptions: { input: join(root, "views", `${n}.html`) } },
  });
}
console.log("views built:", names.join(", "));
