# Repository Guidelines

## Project Structure & Module Organization
This repository is a Vite + Svelte app with Tailwind/PostCSS styling.

- `src/App.svelte`: main sequencer UI and Tone.js playback logic.
- `src/main.js`: app bootstrap/entry point.
- `src/app.css`: Tailwind directives and shared utility classes (`.btn-zinc`, `.squircle`).
- `src/assets/`: bundled assets (SVG + audio samples such as `src/assets/sounds/kick.ogg`).
- `public/`: static assets served as-is.
- `dist/`: production output from Vite build (generated; do not edit).

## Build, Test, and Development Commands
Run from repo root:

```bash
npm install      # install dependencies
npm run dev      # start local dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the built app locally
```

`npm run build` should succeed before opening a PR.

## Coding Style & Naming Conventions
- Use Svelte component naming in `PascalCase` (for example, `App.svelte`).
- Use `camelCase` for variables/functions; reserve `UPPER_SNAKE_CASE` for stable constants.
- Follow existing style in touched files; avoid unrelated formatting churn.
- Keep reactive `$:` blocks deterministic and side-effect aware.
- Group Tailwind classes consistently (layout/spacing first, then color/state).

No formatter/linter is currently configured in scripts, so keep changes small and readable.

## Testing Guidelines
There is no automated test suite configured yet.

Minimum validation for each change:
1. Run `npm run build` with no errors.
2. Smoke test in `npm run dev`: play/stop behavior, BPM slider updates, volume slider, and step-toggle interaction.

When adding tests, place them under `src/` using `*.test.js` naming and add a matching npm script in `package.json`.

## Commit & Pull Request Guidelines
Recent commits use short, lowercase, task-focused subjects (for example: `ui sync fixes`, `added effects`).

- Keep commit subjects concise and scoped to one logical change.
- In PRs, include: purpose, key code changes, manual test steps, and screenshots/GIFs for UI changes.
- Link related issues when available and note any follow-up work.

## Configuration & Asset Notes
- Keep generated folders (`dist/`, `node_modules/`) out of commits.
- Add new samples/icons under `src/assets/` and import them explicitly in code.
