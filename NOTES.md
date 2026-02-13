# NOTES

## Working Rule
- Change one thing at a time.
- Verify after each change before moving to the next item.

## Current Focus
Feature iteration plan (3 items): voice pool, smoothed controls, and layered engine tone.

## Scope (This Step Only)
- Implement and verify one feature at a time.

## Checklist
- [x] Feature 1: voice pool for high-BPM overlap handling.
- [x] Feature 2: BPM and volume parameter smoothing.
- [x] Feature 3: layered engine tone (body + combustion).

## Change Log
- 2026-02-06: Created notes tracker and set first scoped stabilization task.
- 2026-02-06: Added `Tone.Transport` lifecycle guard in `src/App.svelte` using `onMount`/`onDestroy`, plus play/stop guards to prevent duplicate starts.
- 2026-02-06: Verification: `npm run build` passed successfully after the transport-lifecycle change.
- 2026-02-06: Feature 1 added: replaced single kick player with an 8-voice round-robin pool to reduce retrigger cutoff artifacts.
- 2026-02-06: Feature 1 verification: `npm run build` passed.
- 2026-02-06: Feature 2 added: BPM and volume updates now use clamped values and short `rampTo` smoothing.
- 2026-02-06: Feature 2 verification: `npm run build` passed.
- 2026-02-06: Feature 3 added: layered engine output with continuous body oscillator plus per-hit combustion noise.
- 2026-02-06: Feature 3 verification: `npm run build` passed.
- 2026-02-06: Volume fix: switched slider/gain range to linear `0..1` and removed parallel bypass paths so all audio flows through one master volume node.
- 2026-02-06: Volume fix verification: `npm run build` passed; static check confirms only `bellFilter -> volumeControl -> destination` output path.

## Parking Lot (Later)
- Manual play/stop stress test in browser.
