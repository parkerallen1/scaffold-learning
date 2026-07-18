# Prototype Baseline

Recorded on 2026-07-17 before Milestone 0 source migration.

This is a historical snapshot. The Gemini browser integration and dependency described below were
removed; the current server integration uses only the official OpenAI SDK and Responses API.

## Revision and environment

- Baseline revision: `9d6f1c6`
- Node used for verification: `v26.0.0`
- npm: `11.12.1`
- Install: clean `npm ci`
- Target browser: managed ChromeOS Chrome at 1366×768

## Build

`npm run build` passes with Vite 6.4.1.

| Output | Raw | Gzip |
|---|---:|---:|
| `dist/index.html` | 0.99 kB | 0.49 kB |
| Main JavaScript | 262.15 kB | 81.41 kB |

The prototype has no unit, component, rules, or end-to-end test command.

## Behavior to characterize before intentional changes

- Password gate opens the quiz after the hard-coded app password.
- Seed quiz presents 12 questions one at a time.
- Answers are checked on every keystroke; correct answers unlock Next.
- Question 12 accepts the two expected decimal operands in either order.
- Question 10 renders a table.
- Speaker button calls browser-bundled Gemini TTS.
- Canvas accepts separate mouse and touch handlers and can be cleared.
- Typing `admin` opens prototype settings.
- Timer expiry auto-advances.
- Correct answers can show uploaded reward media.
- Completion screen restarts the quiz.

This list records existing behavior; it does not endorse it. Client-side secrets, false authentication, timer auto-advance, and the infinite correctness gate are intentionally removed or replaced in later packets.

## Security and dependency baseline

- `vite.config.ts` injects the Gemini API key into browser code.
- `index.html` loads Tailwind and application modules from runtime CDNs.
- App and admin passwords are present in client source.
- There is no backend authorization or persistent audit trail.
- `npm audit` reports 8 known vulnerabilities: 1 low, 2 moderate, and 5 high.
- The direct Vite 6 dependency is affected by published dev-server file-read/path issues; the local toolchain packet must move to a fixed supported release.
- Other findings are transitive through the existing Vite/Gemini dependency graph and should be reevaluated after removing `@google/genai` and updating the toolchain.

Do not run `npm audit fix --force` blindly. Dependency changes must be reviewed with the build and test matrix once the quality toolchain exists.
