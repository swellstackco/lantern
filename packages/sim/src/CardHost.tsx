import { useEffect, useRef, useState } from "react";
import type { McpHandle } from "./mcpClient";
import type { UiPayload } from "./brainLoop";

/** Renders a ui:// resource in a sandboxed iframe. Data is delivered with the postMessage shim ({type:"lantern:data"}). */
export function CardHost({ mcp, ui }: { mcp: McpHandle; ui: UiPayload }) {
  const [html, setHtml] = useState<string>("");
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { let live = true; mcp.readUi(ui.resourceUri).then((h) => live && setHtml(h)); return () => { live = false; }; }, [ui.resourceUri, mcp]);
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.type !== "lantern:call") return;
      (e.source as Window).postMessage({ type: "lantern:ack", id: e.data.id }, "*");
      const r: any = await mcp.call(e.data.name, e.data.arguments).catch((err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] }));
      (e.source as Window).postMessage({ type: "lantern:result", id: e.data.id, result: { structuredContent: r.structuredContent, isError: r.isError, content: r.content } }, "*");
    };
    window.addEventListener("message", onMsg); return () => window.removeEventListener("message", onMsg);
  }, [mcp]);
  const post = () => ref.current?.contentWindow?.postMessage({ type: "lantern:data", structuredContent: ui.data }, "*");
  useEffect(() => { if (!html) return; const t = [setTimeout(post, 150), setTimeout(post, 600)]; return () => t.forEach(clearTimeout); }, [html, ui.data]);
  return <iframe ref={ref} title={ui.name} sandbox="allow-scripts" srcDoc={html} onLoad={post} />;
}
