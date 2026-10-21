import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { rpcLog } from "./rpcLog";

/** Wraps the real Streamable HTTP transport so the developer drawer can show raw JSON-RPC. */
class LoggingTransport implements Transport {
  onclose?: () => void; onerror?: (e: Error) => void; onmessage?: (m: any, extra?: any) => void;
  constructor(private inner: StreamableHTTPClientTransport) {
    (inner as any).onmessage = (m: any, extra?: any) => { rpcLog.push("in", m); this.onmessage?.(m, extra); };
    inner.onclose = () => this.onclose?.();
    inner.onerror = (e) => this.onerror?.(e);
  }
  start() { return this.inner.start(); }
  close() { return this.inner.close(); }
  async send(msg: any, opts?: any) { rpcLog.push("out", msg); return this.inner.send(msg, opts); }
  get sessionId() { return this.inner.sessionId; }
  setProtocolVersion(v: string) { this.inner.setProtocolVersion?.(v); }
}

export interface McpHandle { client: Client; tools: { name: string; description?: string }[]; call(name: string, args: Record<string, unknown>): Promise<any>; readUi(uri: string): Promise<string> }

export async function connectMcp(): Promise<McpHandle> {
  const transport = new LoggingTransport(new StreamableHTTPClientTransport(new URL("/mcp", window.location.origin)));
  const client = new Client({ name: "lantern-simulator", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport as any);
  const { tools } = await client.listTools();
  const htmlCache = new Map<string, string>();
  return {
    client, tools: tools.map((t) => ({ name: t.name, description: t.description })),
    call: (name, args) => client.callTool({ name, arguments: args }),
    async readUi(uri) {
      if (htmlCache.has(uri)) return htmlCache.get(uri)!;
      const r: any = await client.readResource({ uri });
      const text = r.contents?.[0]?.text ?? "";
      htmlCache.set(uri, text); return text;
    },
  };
}
