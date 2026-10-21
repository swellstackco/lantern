// The edit: turns measured clip durations into one timeline (audio placement, device states, camera moves,
// overlays, panels, cards, captions). Everything is derived from clip lengths, so swapping the voice clips
// re-times the whole film. Pure function: (clips, alignments, shots) -> timeline.
import { piece, chime, splice } from "./audio.mjs";

const BASE = { x: 294, y: 62, scale: 1.04, opacity: 1, blur: 0 };
const SIDE = { x: 36, y: 262, scale: 0.56, opacity: 0.9, blur: 0 };
const PANEL = { x: 884, y: 62, scale: 1 };
const GAP = 0.1;

export function storyboard({ clips, align, shots, chart, inspector, skill, excerpt, cuts = new Set() }) {
  const tl = { fps: 30, audio: [], captions: [], nocap: [], states: [], cam: [], layout: [], overlays: [], panels: [], tall: [], cards: [], term: null, notes: [] };
  const ch = chime();
  let c = 0;
  const ev = (clip, t, extra = {}) => { tl.audio.push({ id: clip.id, layer: clip.layer, file: clip.file, start: +t.toFixed(3), dur: clip.dur, text: clip.text, phrases: clip.phrases?.map((p) => ({ ...p, start: +(t + p.start).toFixed(3), end: +(t + p.end).toFixed(3) })), ...extra }); return t + clip.dur; };
  const sfx = (t) => tl.audio.push({ id: "chime", layer: "sfx", file: ch.file, start: +t.toFixed(3), dur: ch.dur });
  const state = (t, img) => tl.states.push({ t: +t.toFixed(3), img });
  const lay = (t, o, ease = "io") => tl.layout.push({ t: +t.toFixed(3), ...o, ease });
  const cam = (t, cx, cy, s, ease = "io") => tl.cam.push({ t: +t.toFixed(3), cx, cy, s, ease });
  const ov = (o) => tl.overlays.push(o);
  const line = (id) => clips[id];
  // dialog line: voiced (returns end time) or, if dropped for time, a short silent beat
  const voiced = (id, t) => ev(line(id), t);
  const phr = (id) => align[id].phrases;

  // ---------- HOOK (ink card) ----------
  const n01 = line("n01"), p01 = phr("n01");
  const n01t = 0.5;
  let end = ev({ ...n01, phrases: p01 }, n01t);
  tl.cards.push({ id: "hook", t0: 0, t1: end + 0.4 + 1.7 - 0.1, hideAfter: true, noOut: true, itemsOutAt: end + 0.4 - 0.6, bg: "ink", glow: 0.55, items: [
    { t: n01t + p01[0].start - 0.15, text: "Families notice memory change months too late.", cls: "h1" },
    { t: n01t + p01[1].start - 0.1, text: "Clinics test once a year.", cls: "h1 amber" },
    { t: n01t + p01[2].start - 0.1, text: "And the test itself teaches you the test.", cls: "sub" } ] });
  tl.nocap.push([0, end + 0.4]);
  c = end + 0.4;

  // ---------- TITLE (paper card, then the simulator fades in) ----------
  const n02 = line("n02"), p02 = phr("n02");
  const n02t = c - 0.35 + 0.35;
  end = ev({ ...n02, phrases: p02 }, n02t);
  const devIn = n02t + n02.dur * 0.5;
  tl.cards.push({ id: "title", t0: c - 0.1, t1: devIn + 1.1, bloom: true, bg: "paper", glow: 0.9, lantern: true, items: [
    { t: c - 0.1, text: "Lantern", cls: "word" },
    { t: n02t + 0.9, text: "Early light on memory and speech change — through everyday talk with Alexa+.", cls: "tag" } ] });
  tl.nocap.push([c - 0.1, devIn + 0.4]);
  lay(0, { ...BASE, opacity: 0 }); lay(devIn, { ...BASE, scale: BASE.scale * 0.965, opacity: 0 }); lay(devIn + 1.2, BASE, "out");
  state(0, "ambient"); cam(0, 640, 400, 1);
  cam(devIn, 640, 400, 1); cam(end + 0.6, 640, 400, 1.035, "io");
  c = end + 0.15;

  // ---------- LIVE CHECK-IN ----------
  // Every Alexa bubble is spoken word for word; a bubble appears exactly when its line starts; the narrator only speaks in the gaps.
  const n03 = line("n03"), a03 = align["n03"];
  const ph03 = a03.phrases.length;
  const grp = ph03 === 10 ? [[0, 1], [2, 3], [7, 9]] : [[0, Math.min(1, ph03 - 1)], [Math.min(2, ph03 - 1), Math.min(3, ph03 - 1)], [Math.max(0, ph03 - 3), ph03 - 1]];
  const [pcA, pcB, pcC] = grp.map(([i0, i1]) => piece(n03, a03, i0, i1));
  const voiced_rose = (id, tt) => ev(line(id), tt) + 0.07;
  const dialog = (id, pre, post, t0, o = {}) => { // Rose line (pre state) or Alexa line (post state) starts exactly with its audio
    state(t0, pre ?? post); return ev(line(id), t0) + (o.gap ?? 0.08); };
  // A: "Rose is a fictional sixty-eight-year-old. Her mom had Alzheimer's." over the ambient screen
  let t; const tA = c; t = ev(pcA, tA) + 0.22;
  cam(tA, 640, 400, 1.0); cam(t, 640, 400, 1.03);
  // morning: wake chime, then strict back-and-forth
  sfx(t); state(t + 0.05, "m1-pre"); t += 0.5;
  t = dialog("a01", null, "m1-post", t);
  t = dialog("r01", "m2-pre", null, t);
  t = dialog("a02", null, "m2-post", t);
  const tR2 = t;
  t = dialog("r02", "m3-pre", null, t);
  ov({ k: "chip", t0: tR2, t1: t + 2.2, text: "Orientation", slot: 0 });
  const tm3 = t;
  t = dialog("a03", null, "m3-post", t, { gap: 0.15 });
  // B: "Nothing here feels like a test — but every answer is a measurement."
  const tB = t; t = ev(pcB, tB) + 0.15;
  const dots = shots["m3-post"].boxes.dots;
  if (dots) ov({ k: "ring", sp: "world", rect: [dots.x - 8, dots.y - 6, dots.w + 16, dots.h + 12], t0: tm3 + 0.5, t1: tB + 1.6, label: null });
  // afternoon
  sfx(t); state(t + 0.05, "d1-pre"); t += 0.5;
  t = dialog("a04", null, "d1-post", t);
  const tR3 = t; t = dialog("r03", "d2-pre", null, t);
  ov({ k: "chip", t0: tR3, t1: t + 2.6, text: "Delayed recall", slot: 0 });
  t = dialog("a05", null, "d2-post", t);
  const tR4 = t; t = dialog("r04", "d3-pre", null, t);
  ov({ k: "chip", t0: tR4, t1: t + 3.0, text: "Category fluency", slot: 0 });
  ov({ k: "chip", t0: tR4 + 0.2, t1: t + 3.0, text: "Animals named · {n}", slot: 1, from: 0, to: 8, dur: Math.max(1.4, t - tR4 - 0.5) });
  t = dialog("a06", null, "d3-post", t);
  const tR5 = t; t = dialog("r05", "d4-pre", null, t, { gap: 0.15 });
  ov({ k: "chip", t0: tR5, t1: t + 5.5, text: "Yesterday\u2019s story", slot: 0 });
  // C: "And something new: Lantern remembers what Rose told it yesterday..."
  const tC = t; t = ev(pcC, tC) + 0.12;
  cam(tC, 640, 400, 1.0); cam(t, 640, 400, 1.04);
  const checkinEnd = t;

  // ---------- DRAWER ----------
  const n04 = line("n04"), p04 = phr("n04");
  const tD = checkinEnd - 0.2;
  lay(tD - 0.05, BASE); lay(tD + 1.0, SIDE, "io");
  cam(tD, 640, 400, 1); cam(tD + 1, 640, 400, 1);
  const n04t = tD + 0.5; end = ev({ ...n04, phrases: p04 }, n04t);
  const abs = (i, k = "start") => n04t + p04[Math.min(i, p04.length - 1)][k];
  const pan = (id, t0, t1) => tl.panels.push({ id, img: id, t0, t1, keys: [{ t: t0, x: PANEL.x + 90, y: PANEL.y, s: 0.97, o: 0, ease: "out" }, { t: t0 + 0.7, x: PANEL.x, y: PANEL.y, s: 1, o: 1, ease: "out" }], hold: true });
  const swap = [["drawer-list", tD + 0.6, abs(2) - 0.05], ["drawer-initialize", abs(2) - 0.05, abs(4) - 0.05], ["drawer-toolslist", abs(4) - 0.05, abs(5) + 0.25], ["drawer-startcheckin", abs(5) + 0.25, abs(5) + (p04[5].end - p04[5].start) * 0.55], ["drawer-recordanswer", abs(5) + (p04[5].end - p04[5].start) * 0.55, end + 0.8]];
  swap.forEach(([id, a, b], i) => { tl.panels.push({ id, img: id, t0: a, t1: i < swap.length - 1 ? b + 0.4 : b, fadeIn: i === 0 ? 0.7 : 0.3, fadeOut: i < swap.length - 1 ? 0.02 : 0.4, slide: i === 0 }); });
  const pb = (id, key) => shots[id].boxes[key];
  const pRect = (id, key, pad = 5) => { const b = pb(id, key); return b ? [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2] : null; };
  const rI = pRect("drawer-initialize", "summary", 2); if (rI) ov({ k: "ring", sp: "panel", rect: pRect("drawer-initialize", "protocolVersion"), t0: abs(2) + 0.2, t1: abs(4) - 0.2 });
  ov({ k: "ring", sp: "panel", rect: pRect("drawer-initialize", "2025-11-25"), t0: abs(3), t1: abs(4) - 0.1 });
  ov({ k: "ring", sp: "panel", rect: pRect("drawer-toolslist", "start_checkin"), t0: abs(4) + 0.5, t1: abs(5) + 0.2 });
  ov({ k: "chip", t0: abs(4) - 0.1, t1: abs(5) + 2.0, text: "{n} tools", slot: 0, from: 0, to: 13, dur: 1.0 });
  ov({ k: "ring", sp: "panel", rect: pRect("drawer-startcheckin", "summary", 3), t0: abs(5) + 0.35, t1: abs(5) + (p04[5].end - p04[5].start) * 0.55 - 0.1 });
  c = end + 0.3;

  // ---------- TREND ----------
  lay(c - 0.2, SIDE); lay(c + 0.9, BASE, "io");
  cam(c, 640, 400, 1);
  sfx(c + 0.3); state(c + 0.2, "t1-pre");
  t = c + 0.55; state(t, "t1-post");
  const tT = t; t = voiced("a08", t) + 0.1;
  cam(tT, 640, 400, 1.0); cam(t, 640, 400, 1.12);
  const n05 = line("n05"), p05 = phr("n05"); const n05t = t; end = ev({ ...n05, phrases: p05 }, n05t);
  const a5 = (i, k = "start") => n05t + p05[Math.min(i, p05.length - 1)][k];
  const ring = chart.ring, band = chart.band, flag = chart.flag, cc = chart.chart;
  const rcx = ring.x + ring.w / 2, rcy = ring.y + ring.h / 2;
  const sx0 = band.x + band.w * 0.62, sx1 = band.x + band.w, sy0 = flag.y, sy1 = flag.y + flag.h;
  const chcx = cc.x + cc.w / 2 - 6, chcy = cc.y + cc.h / 2;
  // find phrase indices by content
  const find = (re) => { const i = p05.findIndex((p) => re.test(p.text)); return i < 0 ? 0 : i; };
  const iBase = find(/baseline/i), i38 = find(/thirty-eight/i), iBad = find(/One bad day/i), iSix = find(/day sixty/i), iTen = find(/ten straight/i);
  cam(n05t, 640, 400, 1.12); cam(n05t + 1.6, chcx, chcy, 1.82, "io");
  ov({ k: "shade", rect: [band.x, band.y, band.w * 0.16, band.h], color: "teal", t0: a5(iBase), t1: a5(i38) - 0.2 });
  ov({ k: "callout", anchor: [band.x + band.w * 0.08, band.y + band.h], dx: 10, dy: 70, text: "Her own baseline", t0: a5(iBase) + 0.1, t1: a5(i38) - 0.25, small: true });
  // day 38 beat: cursor-led zoom
  const t38 = a5(i38) - 0.1;
  ov({ k: "cursor", keys: [{ t: a5(iBase), x: cc.x + cc.w * 0.8, y: cc.y + 30 }, { t: t38, x: cc.x + cc.w * 0.7, y: cc.y + cc.h * 0.55 }, { t: t38 + 1.5, x: rcx + 6, y: rcy + 6 }, { t: a5(iSix), x: rcx + 6, y: rcy + 6 }, { t: a5(iSix) + 1.8, x: sx0 + (sx1 - sx0) * 0.5, y: (sy0 + sy1) / 2 }, { t: end, x: sx0 + (sx1 - sx0) * 0.7, y: (sy0 + sy1) / 2 }], t0: a5(iBase) + 0.3, t1: end + 0.2 });
  cam(t38, chcx, chcy, 1.82); cam(t38 + 1.7, rcx + 20, rcy - 25, 3.4, "io");
  ov({ k: "ring", sp: "world", rect: [ring.x - 9, ring.y - 9, ring.w + 18, ring.h + 18], t0: t38 + 1.4, t1: a5(iSix) - 0.1, round: true });
  ov({ k: "callout", anchor: [rcx, rcy], dx: 70, dy: -190, text: "Day 38 — one bad night: no alert", t0: t38 + 1.5, t1: a5(iSix) - 0.15 });
  // days 60–90
  const tS = a5(iSix) - 0.15;
  cam(tS, rcx + 20, rcy - 25, 3.4); cam(tS + 2.0, (sx0 + sx1) / 2 - 18, (sy0 + sy1) / 2 + 6, 2.6, "io");
  ov({ k: "shade", rect: [sx0, sy0, sx1 - sx0, sy1 - sy0], color: "amber", t0: tS + 0.6, t1: end + 0.1 });
  ov({ k: "callout", anchor: [(sx0 + sx1) / 2, sy1], dx: -330, dy: 105, text: "Days 60–90 — slow slide: Maya gets a note", t0: tS + 1.2, t1: end + 0.1 });
  ov({ k: "chip", t0: a5(iTen), t1: end + 0.2, text: "{n} straight days before any alert", slot: 0, from: 0, to: 10, dur: Math.max(1.6, a5(iTen, "end") - a5(iTen) - 0.4) });
  cam(end - 0.05, (sx0 + sx1) / 2 - 18, (sy0 + sy1) / 2 + 6, 2.6); cam(end + 1.0, 640, 400, 1.0, "io");
  c = end + 0.12;

  // ---------- OUTBOX + VISIT ----------
  let n06 = line("n06"), a06 = align["n06"];
  if (cuts.has("n06-decline")) { const r = splice(n06, a06, /never hears|decline/i, "cut"); n06 = r.clip; a06 = r.al; tl.notes.push("cut n06: Rose never hears the word 'decline.'"); } const np = a06.phrases.length;
  const cutAt = a06.phrases.findIndex((p) => /^And Alexa/i.test(p.text));
  const split = cutAt > 0 ? cutAt : Math.ceil(np / 2);
  const n06a = piece(n06, a06, 0, split - 1), n06b = piece(n06, a06, split, np - 1);
  lay(c, BASE); lay(c + 1.0, SIDE, "io");
  const t6 = c + 0.25; end = ev(n06a, t6);
  tl.panels.push({ id: "outbox-0", img: "outbox-0", t0: c + 0.3, t1: end + 0.9, fadeIn: 0.7, fadeOut: 0.4, slide: true });
  const ib = pb("outbox-0", "item");
  if (ib) ov({ k: "ring", sp: "panel", rect: [ib.x - 4, ib.y - 4, ib.w + 8, ib.h + 8], t0: t6 + 0.4, t1: end - 0.2 });
  t = end + 0.3;
  lay(t - 0.15, SIDE); lay(t + 0.8, BASE, "io"); cam(t, 640, 400, 1);
  state(t + 0.2, "t2-pre"); t += 0.5; t = voiced_rose("r06", t);
  state(t, "t2-post"); t = voiced("a09", t) + 0.1;
  lay(t, BASE); lay(t + 0.9, SIDE, "io");
  const t6b = t + 0.2; end = ev(n06b, t6b);
  tl.panels.push({ id: "outbox-1", img: "outbox-1", t0: t + 0.2, t1: end + 0.9, fadeIn: 0.7, fadeOut: 0.4, slide: true });
  const ib1 = pb("outbox-1", "item");
  if (ib1) ov({ k: "ring", sp: "panel", rect: [ib1.x - 4, ib1.y - 4, ib1.w + 8, ib1.h + 8], t0: t6b + 0.5, t1: end - 0.2 });
  ov({ k: "chip", t0: t6b + 0.4, t1: end + 0.4, text: "Invite sent · calendar updated", slot: 0 });
  c = end + 0.12;

  // ---------- DOCTOR SUMMARY + VOICE ----------
  lay(c - 0.2, SIDE); lay(c + 0.9, BASE, "io"); cam(c, 640, 400, 1);
  sfx(c + 0.4); state(c + 0.3, "ds-pre");
  t = c + 0.5; state(t, "ds-post"); t += 0.15;
  const n07 = line("n07"), a07al = align["n07"], np7 = a07al.phrases.length;
  const iPage = Math.max(0, a07al.phrases.findIndex((p) => /one page/i.test(p.text)));
  const iDemo = a07al.phrases.findIndex((p) => /In our demo/i.test(p.text));
  const i7 = iDemo > iPage ? iDemo : Math.min(np7 - 1, iPage + 1);
  // time recovered: the "Real-change numbers, how often she answered..." sentence is cut
  const n07a = piece(n07, a07al, 0, iPage), n07b = piece(n07, a07al, i7, np7 - 1);
  const doc = shots["doctor-tall"]; const docH = doc.h * 0.585;
  const scr = shots["ds-post"].boxes.screen; const maxY = Math.max(0, docH - scr.h);
  const n07t = t; end = ev(n07a, n07t);
  tl.tall.push({ img: "doctor-tall", t0: n07t - 0.1, t1: end + 0.3, rect: [scr.x, scr.y, scr.w, scr.h], crop: 0.585, keys: [{ t: n07t, y: 0 }, { t: end + 0.2, y: maxY * 0.55 }], fadeIn: 0.5, fadeOut: 0.35 });
  ov({ k: "chip", t0: n07t + 0.3, t1: end + 0.2, text: "One page for the doctor", slot: 0 });
  // voice: ask for it, the card appears, then push in to the Voice sparkline while the narrator talks about voice
  t = end + 0.2; sfx(t); state(t + 0.05, "vt-pre"); t += 0.5; state(t, "vt-post");
  const tV = t + 0.15; end = ev(n07b, tV);
  const vb = shots["vt-voice"].boxes.voice;
  state(tV + 1.0, "vt-voice");
  if (vb) {
    const vcx = vb.x + 140, vcy = vb.y + 115;
    cam(tV, 640, 400, 1.0); cam(tV + 1.0, 640, 400, 1.0); cam(tV + 3.8, vcx, vcy, 1.9, "io"); cam(end + 0.2, vcx + 30, vcy - 6, 2.1, "io");
    ov({ k: "ring", sp: "world", rect: [vb.x - 20, vb.y - 20, 306, 200], t0: tV + 3.2, t1: end, label: null });
  }
  ov({ k: "chip", t0: tV + 1.2, t1: end + 0.2, text: "Voice features · simulator only · numbers, never audio", slot: 0 });
  cam(end + 0.2, vb ? vb.x + 170 : 640, vb ? vb.y + 109 : 400, 2.1); cam(end + 0.9, 640, 400, 1.0, "io");
  c = end + 0.12;

  // ---------- RESEARCH ----------
  let n08 = line("n08"), p08 = phr("n08");
  if (cuts.has("n08-nothing-new")) { const r = splice(n08, align.n08, /needs nothing new/i, "cut"); n08 = r.clip; p08 = r.al.phrases; tl.notes.push("cut n08: Lantern needs nothing new."); } const t8 = c + 0.2;
  const b8 = (re) => { const i = p08.findIndex((p) => re.test(p.text)); return i < 0 ? 0 : i; };
  end = ev({ ...n08, phrases: p08 }, t8);
  const a8 = (i, k = "start") => t8 + p08[Math.min(i, p08.length - 1)][k];
  const iEnroll = b8(/Researchers enroll/), iConsent = b8(/consent/), iExport = b8(/exports|names removed/), iFmt = b8(/standard medical/);
  state(c, "sd-pre"); state(c + 0.35, "sd-post");
  const dash = shots["dashboard-tall"], sbox = shots["ds-post"].boxes.screen;
  const dview = sbox.h, dmax = Math.max(0, dash.h - dview);
  tl.tall.push({ img: "dashboard-tall", t0: t8 - 0.2, t1: a8(iConsent) - 0.1, rect: [sbox.x, sbox.y, sbox.w, sbox.h], crop: 1, keys: [{ t: t8, y: 0 }, { t: a8(iEnroll), y: 0 }, { t: a8(iConsent) - 0.3, y: Math.min(dmax, 260) }], fadeIn: 0.6, fadeOut: 0.4 });
  ov({ k: "chip", t0: a8(iEnroll), t1: a8(iConsent), text: "{n} people enrolled", slot: 0, from: 0, to: 12, dur: 1.2 });
  state(a8(iConsent) - 0.1, "c1-post");
  ov({ k: "chip", t0: a8(iConsent), t1: a8(iConsent) + 1.9, text: "Consent per study · stop anytime by voice", slot: 0 });
  const tX = a8(iConsent) + 2.0; state(tX, "dashboard-export");
  const bx = shots["dashboard-export"].boxes;
  if (bx.exportButton) ov({ k: "ring", sp: "world", rect: [bx.exportButton.x - 6, bx.exportButton.y - 6, bx.exportButton.w + 12, bx.exportButton.h + 12], t0: tX + 0.3, t1: end - 0.1, round: true });
  tl.excerpt = { t0: tX + 0.7, t1: end + 0.35, csv: excerpt.csv, fhir: excerpt.fhir };
  cam(tX - 0.1, 640, 400, 1.0); cam(tX + 1.2, 560, 330, 1.15);
  c = end + 0.12;

  // ---------- HOSTS (real terminal): one clean tools/call + result ----------
  const n09 = line("n09"), a09al = align["n09"];
  const iSk = Math.max(0, a09al.phrases.findIndex((p) => /Agent Skill/i.test(p.text)));
  const n09p = piece(n09, a09al, 0, iSk); // "One command runs the whole thing..." is cut
  const t9 = c + 0.25; end = ev(n09p, t9);
  tl.term = { t0: c - 0.1, t1: end + 1.4, inspector, k: [t9 + 0.4] };
  lay(c - 0.2, BASE); lay(c + 0.45, { ...BASE, scale: BASE.scale * 0.97, opacity: 0, blur: 5 }, "io");
  c = end + 1.4;

  // ---------- EMERGENCY + CLOSE ----------
  lay(c - 0.1, { ...BASE, scale: BASE.scale * 0.97, opacity: 0, blur: 5 }); lay(c + 0.6, BASE, "out"); cam(c, 640, 400, 1);
  sfx(c + 0.3); state(c + 0.2, "e1-pre");
  t = c + 0.3; t = ev(line("r07"), t) + 0.08;
  state(t, "e1-post"); const tE = t; t = ev(line("a07"), t);
  tl.alerts = [{ t0: tE + 0.1, t1: t + 1.15, title: "Call 911 now", sub: "Lantern is letting Maya know." }];
  t += 1.0; // a full second of air on the emergency
  const n10 = line("n10"), p10 = phr("n10"); const t10 = t; end = ev({ ...n10, phrases: p10 }, t10);
  const a10 = (i, k = "start") => t10 + p10[Math.min(i, p10.length - 1)][k];
  const iL = p10.findIndex((p) => /^Lantern\.?$/i.test(p.text.trim())); const iLan = iL < 0 ? Math.max(0, p10.length - 3) : iL;
  const tP = t10 - 0.7;
  tl.panels.push({ id: "outbox-urgent", img: "outbox-urgent", t0: tP, t1: a10(iLan) + 0.15, fadeIn: 0.7, fadeOut: 0.5, slide: true });
  lay(tP, BASE); lay(tP + 0.9, SIDE, "io"); lay(a10(iLan) - 0.2, SIDE); lay(a10(iLan) + 0.7, { ...SIDE, opacity: 0, blur: 6 }, "io");
  const ub = pb("outbox-urgent", "item"); if (ub) ov({ k: "ring", sp: "panel", rect: [ub.x - 4, ub.y - 4, ub.w + 8, ub.h + 8], t0: tP + 1.1, t1: a10(iLan) - 0.1 });
  const closeEnd = end + 1.2;
  tl.cards.push({ id: "close", t0: a10(iLan) - 0.1, t1: closeEnd, noOut: true, bg: "paper", glow: 0.95, lantern: true, items: [
    { t: a10(iLan) + 0.05, text: "Lantern", cls: "word" },
    { t: a10(Math.min(iLan + 1, p10.length - 1)) - 0.1, text: "Not a diagnosis.", cls: "h1" },
    { t: a10(Math.min(iLan + 2, p10.length - 1)) - 0.1, text: "A reason to talk sooner.", cls: "h1 amber" },
    { t: end + 0.2, text: "github.com/swellstackco/lantern  ·  Amazon Developer Hackathon · Alexa+", cls: "url" } ] });
  tl.nocap.push([a10(iLan) - 0.1, closeEnd]);
  tl.duration = +(closeEnd).toFixed(3);

  // ---------- captions (narration only; dialog is already in the on-screen ribbon) ----------
  const chunks = [];
  for (const a of tl.audio.filter((x) => x.layer === "narrator")) {
    let cur = null;
    for (const p of a.phrases ?? [{ text: a.text, start: a.start, end: a.start + a.dur }]) {
      if (cur && (cur.text + " " + p.text).length <= 92) { cur.text += " " + p.text; cur.t1 = p.end; }
      else { if (cur) chunks.push(cur); cur = { t0: p.start, t1: p.end, text: p.text }; }
    }
    if (cur) chunks.push(cur);
  }
  chunks.sort((a, b) => a.t0 - b.t0);
  tl.captions = chunks.map((k, i) => ({ t0: +(k.t0 - 0.05).toFixed(3), t1: +(Math.min(k.t1 + 0.18, chunks[i + 1] ? chunks[i + 1].t0 - 0.02 : 1e9)).toFixed(3), text: k.text }))
    .filter((k) => !tl.nocap.some(([a, b]) => Math.min(k.t1, b) - Math.max(k.t0, a) > (k.t1 - k.t0) * 0.45));
  return tl;
}
