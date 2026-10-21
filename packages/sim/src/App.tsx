import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PRODUCT } from "@lantern/shared";
import { connectMcp, type McpHandle } from "./mcpClient";
import { rpcLog } from "./rpcLog";
import { runTurn, type Msg, type UiPayload } from "./brainLoop";
import { listen, micSupported, speech } from "./speech";
import { CardHost } from "./CardHost";
import "./styles.css";

const CHIPS = ["Alexa, good morning", "Alexa, good afternoon", "Alexa, good evening", "How am I doing?", "Show Maya the trend", "Any updates for Maya?", "Show the doctor summary", "I fell and my face feels numb"];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return <div className="ambient">
    <div className="time">{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/, "")}</div>
    <div className="date">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
    <div className="hint">Try saying, &ldquo;Alexa, good morning.&rdquo;</div>
  </div>;
}

function Drawer() {
  const entries = useSyncExternalStore(rpcLog.subscribe, rpcLog.get);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [entries.length]);
  return <div className="scroll" aria-label="JSON-RPC log">
    <div className="row small muted" style={{ marginBottom: 6 }}><span>{entries.length} messages</span><button className="btn" onClick={() => rpcLog.clear()}>Clear</button></div>
    {entries.map((e) => <details className="entry" key={e.n}>
      <summary><span className={`dir ${e.dir}`}>{e.dir === "out" ? "→" : "←"}</span><span>{e.summary}</span>{e.ms != null && <span className="ms">{e.ms} ms</span>}</summary>
      <pre>{JSON.stringify(e.json, null, 2)}</pre></details>)}
    <div ref={end} />
  </div>;
}

function Outbox() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const load = useCallback(() => fetch("/api/outbox").then((r) => r.json()).then((x) => { setItems(x); if (x.length && !open) setOpen(x[0]); }), [open]);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  return <div className="scroll">
    <div className="small muted" style={{ marginBottom: 8 }}>Local outbox. Nothing is really emailed.</div>
    {items.map((i) => <button key={i.id} className="outbox-item" onClick={() => setOpen(i)}><b>{i.subject}</b><div className="small muted">to {i.to} &middot; {new Date(i.createdAt).toLocaleTimeString()}</div></button>)}
    {open && <iframe className="preview" title="Email preview" sandbox="" srcDoc={open.body} />}
    {!items.length && <p className="muted">No messages yet.</p>}
  </div>;
}

export default function App() {
  const [mcp, setMcp] = useState<McpHandle | null>(null);
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ui, setUi] = useState<UiPayload | null>(null);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [tab, setTab] = useState<"talk" | "dev" | "outbox">("talk");
  const [text, setText] = useState("");
  const [meter, setMeter] = useState<{ f0Iqr: number; pauseRatio: number; rmsDb: number } | null>(null);
  const [scale, setScale] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const brainState = useRef<any>(undefined);
  const nextId = useRef(1);

  useEffect(() => { connectMcp().then(setMcp).catch((e) => setError(String(e?.message ?? e))); }, []);
  useEffect(() => {
    const fit = () => wrap.current && setScale(Math.min(1, wrap.current.clientWidth / 1280));
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => { speech.setEnabled(voice); }, [voice]);

  const send = useCallback(async (t: string, timings?: { startMs: number; endMs: number }, acoustic?: Record<string, number>) => {
    const clean = t.replace(/^\s*alexa[,.]?\s*/i, "").trim();
    if (!mcp || !clean) return;
    setMsgs((m) => [...m.slice(-5), { who: "rose", text: t, id: nextId.current++ }]);
    setText("");
    await runTurn(mcp, brainState, clean, {
      say: (display, spoken) => { setMsgs((m) => [...m.slice(-5), { who: "alexa", text: display, id: nextId.current++ }]); speech.speak(spoken); },
      ui: setUi, thinking: setThinking,
    }, timings, acoustic);
  }, [mcp]);

  const startMic = () => { if (!micSupported()) return; setMeter(null); void listen((t, tm, ac) => send(t, tm, ac as any), setListening, setMeter); };

  return <div className="stage">
    <div className="device-wrap" ref={wrap} style={{ height: 800 * scale }}>
      <div className="device" style={{ transform: `scale(${scale})` }}>
        <div className="screen" aria-label="Echo Show simulator screen">
          <div className="main">
            {ui && !ui.fullscreen && mcp ? <div className="cardslot"><CardHost mcp={mcp} ui={ui} /></div> : <Clock />}
          </div>
          <div className="ribbon" aria-live="polite">
            {msgs.slice(-4).map((m) => <div key={m.id} className={`bubble ${m.who}`}><span className="who">{m.who === "alexa" ? "Alexa" : "Rose"}</span>{m.text}</div>)}
          </div>
          <div className={`bar ${listening || thinking ? "on" : ""}`}><div className="fill" /></div>
          {ui?.fullscreen && mcp && <div className="fs"><button className="btn" onClick={() => setUi(null)} aria-label="Close">Close</button><CardHost mcp={mcp} ui={ui} /></div>}
        </div>
      </div>
    </div>
    <aside className="side" aria-label="Controls">
      <div className="row" style={{ justifyContent: "space-between" }}><h2>{PRODUCT.name} simulator</h2><span className="badge">{mcp ? "MCP connected" : error ? "offline" : "connecting"}</span></div>
      <div className="tabs" role="tablist">
        {(["talk", "dev", "outbox"] as const).map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k === "talk" ? "Talk" : k === "dev" ? "JSON-RPC" : "Outbox"}</button>)}
      </div>
      {error && <p role="alert">Could not reach the server: {error}. Is it running on port {PRODUCT.port}?</p>}
      {tab === "talk" && <div className="scroll">
        <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what Rose says" aria-label="What Rose says" />
          <button className="btn primary" type="submit" disabled={!mcp}>Send</button>
        </form>
        <div className="row" style={{ margin: "10px 0" }}>
          <button className={`btn mic ${listening ? "on" : ""}`} onClick={startMic} disabled={!mcp || !micSupported()} title={micSupported() ? "Speak" : "Needs Chrome"}>{listening ? "Listening…" : "Mic"}</button>
          <label className="row small"><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Alexa voice</label>
          <button className="btn" onClick={() => { setUi(null); }}>Clear card</button>
        </div>
        {meter && <div className="card meter" aria-label="Voice meter" style={{ margin: "0 0 10px" }}>
          <div className="small muted">Voice (experimental, simulator only). Only numbers leave this page, never audio.</div>
          <div className="small">Pitch range</div><div className="gauge"><div style={{ width: `${Math.min(100, (meter.f0Iqr / 60) * 100)}%` }} /></div>
          <div className="small">Pauses</div><div className="gauge alt"><div style={{ width: `${Math.min(100, meter.pauseRatio * 100)}%` }} /></div>
        </div>}
        <div className="small muted" style={{ marginBottom: 6 }}>Quick phrases</div>
        <div className="chips">{CHIPS.map((c) => <button key={c} className="chip" disabled={!mcp} onClick={() => send(c)}>{c}</button>)}</div>
        <p className="small muted" style={{ marginTop: 14 }}>{PRODUCT.disclaimer}</p>
      </div>}
      {tab === "dev" && <Drawer />}
      {tab === "outbox" && <Outbox />}
    </aside>
  </div>;
}
