// One-off helper that wrote lines.json (kept for reference). Edit lines.json directly afterwards.
import { readFileSync, writeFileSync } from "node:fs";
const n = JSON.parse(readFileSync(process.argv[2], "utf8"));
const L = n.map((x) => ({ id: x.id, layer: "narrator", text: x.text, scene: x.scene }));
const R = ["About five hours.", "Tuesday.", "Apple… river.", "Dog, cat, horse, cow, lion, rabbit, bird, fish.", "She won second place.", "Friday ten.", "I fell and my face feels numb."];
const rs = ["checkin", "checkin", "checkin", "checkin", "checkin", "outbox", "close"];
R.forEach((t, i) => L.push({ id: "r0" + (i + 1), layer: "rose", text: t, scene: rs[i] }));
const A = [["a01", "Good morning, Rose. Did you sleep okay?", "checkin", 0], ["a02", "Which ones do you remember?", "checkin", 2], ["a03", "Two of three. The other was candle.", "checkin", 2], ["a04", "Eight. Nice! Yesterday you told me about the science fair. Tell me about it.", "checkin", 3], ["a05", "Here's how Rose is doing. It may be worth a check-up. Want me to add a doctor visit?", "trend", 2], ["a06", "Done. I added the visit for Friday at 10 AM, and sent Maya the note.", "outbox", 2], ["a07", "This could be an emergency. Please call 911 now. I'm letting Maya know.", "close", 1]];
A.forEach(([id, text, scene, priority]) => L.push({ id, layer: "alexa", text, scene, priority }));
writeFileSync(new URL("./lines.json", import.meta.url), JSON.stringify(L, null, 1));
