# Lantern demo video pipeline

Deterministic: stills of the real simulator + measured voice clips -> `timeline.json` -> frame-exact render (30 fps, 1920x1080) -> mp4.

## Re-render (the one command)
    npm run video          # = node video/build.mjs

It re-measures every clip in `video/audio/`, rebuilds the timeline, mixes the audio, renders all frames and writes
`video/out/lantern-demo.mp4`, `video/out/contact-sheet.png`, `video/out/timeline.json`, then prints ffprobe + blackdetect.
`node video/build.mjs --timeline` stops after the timeline and audio mix (fast, to check the length). `--keep-frames` reuses `frames/`.
`node video/render.mjs 12 80 out.jpg` renders single preview frames at those seconds.

## Where the voices go
`video/lines.json` lists every line `{id, layer, text, scene}`. Clips live at `video/audio/<layer>/<id>.wav` (mp3/m4a also fine):
- `narrator/n01..n10` and `rose/r01..r07`: drop real (Cartesia) clips here and run `npm run video`. Missing ones fall back to macOS `say` placeholders.
- `alexa/a01..a07`: always the local macOS `say` voice (Samantha). Regenerated when the text in lines.json changes.
Clips are trimmed, levelled and measured automatically; captions and callouts follow the pauses at punctuation inside each clip.
Alexa lines with `priority` > 0 are shown on screen but left unvoiced when the film would pass `--limit` (default 177.8 s). Edit priorities in lines.json.

## Capture (only when the app changes)
    npm run video:capture   # stop `npm run dev` first; it starts its own seeded copy with the clock pinned to a Tuesday 08:12
Drives the real simulator headless and muted via the text input, saves 3x stills + element boxes to `video/shots/`, and runs the real
MCP Inspector CLI for the terminal scene (`shots/inspector.json`). Needs network once for `npx @modelcontextprotocol/inspector`.

## Layout
`capture.mjs` stills | `audio.mjs` clips, trim, alignment | `storyboard.mjs` the edit | `scene.html` pure `renderAt(t)` | `render.mjs` Chrome frames | `build.mjs` orchestration.
Captions: narration only. Dialog is already on screen in the simulator ribbon, so it is never captioned twice.
