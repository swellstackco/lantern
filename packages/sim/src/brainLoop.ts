import type { McpHandle } from "./mcpClient";

export interface Msg { who: "alexa" | "rose"; text: string; id: number }
export interface UiPayload { resourceUri: string; data: any; fullscreen: boolean; name: string }
export interface LoopHooks { say(display: string, spoken: string): void; ui(p: UiPayload | null): void; thinking(b: boolean): void; onDebug?(m: string): void }

const FULLSCREEN = new Set(["ui://lantern/doctor-summary", "ui://lantern/study-dashboard"]);

/** One user utterance: ask the brain, run the MCP tool calls it asks for, feed results back, until it has something to say. */
export async function runTurn(mcp: McpHandle, brainState: { current: any }, text: string, hooks: LoopHooks, timings?: { startMs: number; endMs: number }, acoustic?: Record<string, number>) {
  hooks.thinking(true);
  let event: any = { type: "user", text };
  try {
    for (let hop = 0; hop < 8; hop++) {
      const res = await fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: brainState.current, event, toolsFromList: mcp.tools }) });
      const b = await res.json();
      if (b.error) throw new Error(b.error);
      brainState.current = b.state;
      if (b.say) hooks.say(b.display ?? b.say, b.say);
      if (!b.toolCalls?.length) break;
      const tc = b.toolCalls[0];
      const args = tc.name === "record_answer" ? { ...tc.arguments, ...(timings ? { clientTimings: timings } : {}), ...(acoustic && acoustic.f0Median > 0 ? { acoustic } : {}) } : tc.arguments;
      const r: any = await mcp.call(tc.name, args);
      const uri = r._meta?.ui?.resourceUri as string | undefined;
      if (uri && !r.isError) hooks.ui({ resourceUri: uri, data: r.structuredContent, fullscreen: FULLSCREEN.has(uri), name: tc.name });
      event = { type: "toolResult", name: tc.name, args: tc.arguments, result: { structuredContent: r.structuredContent, isError: r.isError, text: r.content?.[0]?.text } };
    }
  } catch (e) {
    hooks.say("Sorry, something went wrong. Let's try that again.", "Sorry, something went wrong. Let's try that again.");
    console.error(e);
  } finally { hooks.thinking(false); }
}
