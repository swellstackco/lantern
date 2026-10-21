import { bootstrap, esc, lanternGlyph } from "./common.js";
const GREET: Record<string, string> = { morning: "Good morning", midday: "Hello", evening: "Good evening" };
bootstrap("checkin-card", (d) => {
  const f = d.participantFacts ?? {};
  const date = f.date ? new Date(f.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "";
  return `<div class="row" style="gap:24px;min-height:200px"><div>${lanternGlyph(96)}</div><div>
    <h1>${esc(GREET[d.slot] ?? "Hello")}, ${esc(f.firstName ?? f.name ?? "")}</h1>
    <p style="font-size:26px;margin:6px 0 0">${esc(f.weekday ?? "")}, ${esc(date)}</p>
    ${f.streakDays > 0 ? `<p class="muted" style="margin:10px 0 0">${f.streakDays} ${f.streakDays === 1 ? "day" : "days"} in a row</p>` : ""}
  </div></div>`;
});
