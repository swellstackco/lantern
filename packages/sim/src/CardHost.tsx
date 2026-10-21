import { useEffect, useRef, useState } from "react";
import type { McpHandle } from "./mcpClient";
import type { UiPayload } from "./brainLoop";

/** Renders a ui:// resource in a sandboxed iframe. Data is delivered with the postMessage shim ({type:"lantern:data"}). */
export function CardHost({ mcp, ui }: { mcp: McpHandle; ui: UiPayload }) {
  const [html, setHtml] = useState<string>("");
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { let live = true; mcp.readUi(ui.resourceUri).then((h) => live && setHtml(h)); return () => { live = false; }; }, [ui.resourceUri, mcp]);
  const post = () => ref.current?.contentWindow?.postMessage({ type: "lantern:data", structuredContent: ui.data }, "*");
  useEffect(() => { if (!html) return; const t = [setTimeout(post, 150), setTimeout(post, 600)]; return () => t.forEach(clearTimeout); }, [html, ui.data]);
  return <iframe ref={ref} title={ui.name} sandbox="allow-scripts" srcDoc={html} onLoad={post} />;
}
