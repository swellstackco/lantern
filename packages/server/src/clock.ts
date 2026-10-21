import type { Participant } from "@lantern/shared";
/** Current instant. LANTERN_NOW (ISO) pins it for demos and tests. */
export const now = (): Date => (process.env.LANTERN_NOW ? new Date(process.env.LANTERN_NOW) : new Date());
export const localDay = (tz: string, d: Date = now()): string => d.toLocaleDateString("en-CA", { timeZone: tz });
export function localHour(tz: string, d: Date = now()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(d)) % 24;
}
export const firstName = (p: Pick<Participant, "name">) => p.name.split(" ")[0]!;
export function weekdayName(day: string) { return new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }); }
export function prettyDate(day: string) { return new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }); }
