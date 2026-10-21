/** Tiny store for the developer drawer: every JSON-RPC message in and out, paired by id with timing. */
export interface RpcEntry { n: number; t: number; dir: "out" | "in"; method?: string; id?: string | number; ms?: number; json: unknown; summary: string }
let entries: RpcEntry[] = [];
const subs = new Set<() => void>();
const pending = new Map<string | number, number>();
const pendingName = new Map<string | number, string>();
let n = 0;
export const rpcLog = {
  get: () => entries,
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  clear() { entries = []; subs.forEach((f) => f()); },
  push(dir: "out" | "in", msg: any) {
    const t = performance.now();
    const hasId = msg && msg.id !== undefined;
    let method = msg?.method as string | undefined, ms: number | undefined;
    if (dir === "out" && hasId && method) { pending.set(msg.id, t); pendingName.set(msg.id, method === "tools/call" ? `tools/call ${msg.params?.name}` : method); }
    if (dir === "in" && hasId && !method && pending.has(msg.id)) { ms = Math.round(t - pending.get(msg.id)!); pending.delete(msg.id); }
    const summary = method ? (method === "tools/call" ? `tools/call ${msg.params?.name}` : method) : msg?.error ? `error ${msg.error.message}` : `result (${pendingName.get(msg.id) ?? "?"})`;
    entries = [...entries, { n: ++n, t, dir, method, id: msg?.id, ms, json: msg, summary }];
    subs.forEach((f) => f());
  },
};
