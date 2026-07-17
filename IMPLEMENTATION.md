# Quiz Master v2 — Agent Execution Roadmap

This document turns the product contract in `PLAN.md` into small, dependency-ordered work packets. One packet should normally equal one agent assignment and one logical commit.

## Working assumptions

- Build Week demo targets grades 5–8 math and uses synthetic student data only.
- Teachers use Firebase Google sign-in.
- Students use an 8-character class code, a non-identifying student handle, and a 6-digit PIN.
- The server exchanges student credentials for a Firebase custom token scoped to one classroom and student.
- Resetting a student PIN increments an `authVersion` and revokes refresh tokens; rules compare the token version with the current student record.
- QR login is not P0. If added later, the QR contains a short-lived opaque exchange token, never a reusable raw PIN.
- Firestore is authoritative. Offline P0 protects the active answer/canvas and queues known events; it does not promise full offline classroom operation or conflict-free multi-device editing.
- P0 supports are read-aloud, reading chunks, focus view, and hint ladder. Flexible response is question rendering; safe non-expiring timer behavior is global. Break prompts are the first support cut.
- Published assignments, active support plans, and audit evidence windows are immutable/versioned.
- The P0 AI story is support recommendation plus evidence audit. Worksheet extraction is stretch.

## Agent coordination rules

1. An agent receives one packet, explicit file ownership, and required verification.
2. Agents working in parallel may not edit the same files.
3. The primary agent integrates, verifies, and commits before dependent packets begin.
4. Shared contracts land before UI/server consumers.
5. Every packet preserves a runnable app or is paired with a same-wave integration packet.
6. No agent pushes. The primary agent commits deliberately and reports the clean-tree state.
7. Real student data, production secrets, Firebase deployment, and external writes remain out of scope without explicit approval.

## Definition of done for every packet

- Packet acceptance criteria pass.
- Relevant typecheck, unit, rules, or component tests pass.
- `npm run build` passes unless the packet explicitly owns a scaffold transition.
- No credential or answer key is exposed outside its intended boundary.
- Error, loading, empty, and permission-denied behavior is covered where relevant.
- Changed behavior is documented close to the code or in the appropriate project document.
- Only packet-owned files are staged and committed.

## Standard verification ladder

```sh
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run test:rules
npm run build
npm run test:e2e
```

Scripts are added progressively. Live OpenAI calls are never part of ordinary unit or CI runs.

---

## Milestone 0 — Foundation

### M0-01 Baseline lock

- Install locked dependencies and record the baseline build and dependency audit.
- Capture seed-quiz behavior and current security/runtime risks.
- Depends on: none.
- Verify: baseline `npm run build`; no generated files staged.

### M0-02 Source migration

- Move runtime code under `src/`; establish `app`, `features`, `shared`, and `test` boundaries.
- Preserve the seed quiz, settings, drawing, and completion behavior during the move.
- Depends on: M0-01.
- Verify: build plus render smoke test.

### M0-03 Remove client AI secrets

- Delete browser Gemini integration and Vite secret injection.
- Replace everyday TTS with browser `speechSynthesis`.
- Hide worksheet extraction behind a clear stretch/unavailable state until the server function exists.
- Add a production-bundle secret scan.
- Depends on: M0-02.
- Verify: no `API_KEY`, `GEMINI`, or known secret value in `dist/`.

### M0-04 Local UI toolchain

- Install Tailwind locally and add the project stylesheet.
- Remove Tailwind CDN and import-map runtime dependencies.
- Preserve current visual behavior at 1366×768.
- Depends on: M0-02.
- Safe parallel wave: M0-04 and M0-05 after M0-02.
- Verify: no runtime CDN references in source or build output.

### M0-05 Quality toolchain

- Add formatting, ESLint, typecheck, Vitest, Testing Library, and jsdom.
- Add render, answer-checking, and critical interaction tests.
- Depends on: M0-02.
- Verify: format, lint, typecheck, and unit tests pass.

### M0-06 Firebase/server scaffold

- Add emulator-aware Firebase client initialization.
- Add a TypeScript Cloud Functions workspace and Emulator Suite configuration.
- Add environment templates, local scripts, secret placeholders, and deterministic fake-AI adapter.
- Depends on: M0-03.
- Verify: app and Functions build without real credentials.

### M0-07 CI and architecture decisions

- Add CI for install, format, lint, typecheck, tests, Functions build, secret scan, and app build.
- Record ADRs for identity, synthetic data, AI approval boundaries, answer-key isolation, and limited offline scope.
- Depends on: M0-04, M0-05, M0-06.

---

## Milestone 1 — Identity and tenancy

### M1-01 Domain contracts

- Define branded IDs, timestamps, runtime schemas, Firestore converters, repositories, and deterministic fixtures.
- Separate student-visible assignment content from protected answer keys.
- Define immutable assignment and support-plan versions.
- Depends on: M0-06.

### M1-02 Teacher authentication

- Add Google sign-in/out, teacher bootstrap, protected teacher routes, and loading/error states.
- Provide an emulator-only demo teacher.
- Depends on: M1-01.
- Safe parallel wave: M1-02 and M1-03.

### M1-03 Student credential exchange

- Validate class code + handle + PIN in an App-Check-protected callable and return a scoped custom token.
- Hash PINs with `scrypt`, salt, and server-side pepper; use constant-shape errors and throttling.
- Claims include role, classroom ID, student ID, and `authVersion`.
- Depends on: M1-01.

### M1-04 Classroom and student lifecycle

- Create/archive classrooms and synthetic students; rotate codes and reset PINs.
- PIN reset increments `authVersion` and revokes existing refresh tokens.
- Depends on: M1-02, M1-03.

### M1-05 Authorization rules

- Add deny-first Firestore rules and emulator tests for teacher ownership, student isolation, cross-class denial, answer-key denial, list queries, forged claims, and stale tokens.
- Depends on: M1-04.

### M1-06 Persistence shell

- Add assignment target, session, and canonical event repositories.
- Server-owned writes validate role, ownership, event schema, server time, and idempotency key.
- Depends on: M1-01, M1-05.

---

## Milestone 2 — Onboarding and support plans

### M2-01 Typed support catalog

- Define support keys, settings, defaults, cautions, evidence signals, and runtime validation.
- P0: read-aloud, reading chunks, focus view, and hint ladder.
- Depends on: M1-01.

### M2-02 Manual plan versioning

- Manual editor, immutable versions, atomic active-version pointer, approval metadata, and revert.
- Exactly one version is active at a time.
- Depends on: M2-01, M1-05.

### M2-03 Structured teacher interview

- One-question-at-a-time flow with skip/back/edit and accessible controls.
- Persist structured answers and teacher-approved summary, not raw chat.
- Depends on: M1-04.

### M2-04 OpenAI function harness

- Server adapter with authentication, ownership, schemas, timeouts, rate limits, moderation policy, sanitized logs, and deterministic fake provider.
- Version prompts/models; use `store: false`; return a manual fallback.
- Depends on: M0-06, M1-05.

### M2-05 Recommendation engine and evals

- Catalog-constrained recommendations grounded only in supplied observations.
- Test invented evidence, diagnoses, timer cautions, malformed output, and over-recommendation.
- Depends on: M2-01, M2-03, M2-04.

### M2-06 Teacher review and student preview

- Show rationale/evidence; allow item-level edit/approve/reject and exact student preview.
- Proposed supports have zero effect before approval.
- Depends on: M2-02, M2-05.

### M2-07 Undo and isolation

- Revert flow, approval trail, note-isolation tests, and complete manual path for AI failure.
- Depends on: M2-06.

---

## Milestone 3 — Assignment and student runner

### M3-01 Question models and deterministic checkers

- Numeric, multiple-choice, and short-text schemas.
- Define blank handling, decimal locale, units, tolerance, normalization, and accepted-answer override.
- Depends on: M1-01, M0-05.

### M3-02 Teacher authoring

- Create/edit/preview questions and teacher-approved hints.
- Validation blocks incomplete or ambiguous content.
- Depends on: M3-01, M1-02.

### M3-03 Publish and target

- Publish immutable assignment version and protected answer key.
- Target a student with a support-plan version snapshot.
- Depends on: M3-02, M1-05.

### M3-04 Session lifecycle

- Start/resume/complete state machine, refresh recovery, duplicate-submit protection, and active-answer cache.
- Depends on: M3-03, M1-06.

### M3-05 Base runner

- Submit-based feedback, attempt threshold, help/review-later escape hatch, pause/resume, and no infinite gate.
- Depends on: M3-04.

### M3-06 Core support rendering

- Read-aloud, reading chunks, focus view, and hint ladder driven only by the assigned plan snapshot.
- Depends on: M3-05, M2-07.
- Safe parallel wave: M3-06, M3-07, M3-08.

### M3-07 Response and pacing safety

- Render response mode from question type.
- Timers are non-expiring and never submit or advance.
- Student can hide a non-required support for the current question.
- Depends on: M3-05, M2-07.

### M3-08 Canvas and draft resilience

- Pointer Events canvas, `touch-action: none`, resize retention, and active-work recovery.
- Canvas is stored only after explicit inclusion as evidence.
- Depends on: M3-04.

### M3-09 Evidence instrumentation

- Event taxonomy distinguishes `available`, `shown`, `activated`, `completed`, and `dismissed` support states.
- Add idempotent answer, support, session, and recovery events.
- Depends on: M3-06, M3-07, M3-08.

---

## Milestone 4 — Evidence review and audit

### M4-01 Deterministic metrics engine

- Calculate bounded summaries and personal baselines server-side with missing-data handling.
- Never ask AI to calculate canonical metrics.
- Depends on: M3-09.

### M4-02 Session review

- Show attempts, timing, support use, explicitly saved work, accepted-answer override, and teacher notes.
- Depends on: M4-01.

### M4-03 Evidence packet and threshold gate

- Define inclusion/exclusion rules, minimum evidence, alternatives, and deterministic seeded history.
- Depends on: M4-01.

### M4-04 Audit engine and evals

- Structured output, at most two changes, conservative `observe`, citation validation, and insufficient-evidence behavior.
- Ban causal, diagnostic, peer-comparison, and high-stakes language.
- Depends on: M4-03, M2-04.

### M4-05 Teacher audit decision

- Inspect evidence, approve/edit/reject/note, atomically create plan version, and revert.
- Rejection leaves the plan unchanged.
- Depends on: M4-04, M2-02.

### M4-06 Audit traceability

- Save prompt/model version, evidence-window hash, structured result, decision, latency, and provider request ID.
- Do not persist sensitive prompt content by default.
- Depends on: M4-05.

---

## Milestone 5 — Hardening and submission

### M5-01 Deterministic E2E fixtures

- Seed/reset tools and Playwright teacher/student/audit paths.
- Rehearse onboarding under 3 minutes and authoring under 5 minutes.
- Depends on: M4-05.

### M5-02 Accessibility hardening

- Automated: keyboard, focus, labels, contrast tokens, reduced motion, 200% text, and axe where practical.
- Manual: ChromeOS screen reader, touch targets, stylus, and cognitive walkthrough.
- Depends on: M3-09.

### M5-03 Failure and offline states

- Network loss, stale session, permission denial, AI timeout/refusal/quota, reconciliation, and unsaved-work messages.
- Depends on: M4-05.

### M5-04 Operational controls

- App Check, rate limits, cost telemetry/alerts, AI kill switch, request limits, and sanitized logs.
- Depends on: M4-06.

### M5-05 Demo qualification

- Chromebook viewport checks, two clean reset/runs, bundle secret scan, performance check, and preview deployment.
- Depends on: M5-01 through M5-04.

### M5-06 Documentation and rehearsal

- Update README, architecture, API, and component docs; document retention/fallbacks and script the demo.
- Depends on: M5-05.

---

## Stretch — Worksheet extraction

### S-01 OpenAI assignment extraction

- Validate upload size/type server-side.
- Extract structured draft questions with source-page references and warnings.
- Teacher must review/publish; output never overwrites an existing assignment.
- Test clean worksheets, tables, ambiguous keys, rotated images, and unsupported content.
- Depends on: M3-03, M2-04.

## Synthetic demo retention defaults

- Raw PINs and raw onboarding chat: never stored.
- Structured onboarding, attempts, session events, plans, decisions, and audits: until demo reset/deletion.
- Explicitly included canvas artifacts: 30 days.
- AI operational traces without prompt content: 30 days.
- Student deletion cascades through sessions, attempts, artifacts, observations, plans, recommendations, and audits.

Pilot retention remains undecided until the school completes the readiness gate in `PLAN.md`.

## External blockers and fallbacks

| Dependency | Risk | Build Week fallback |
|---|---|---|
| Firebase Blaze | Functions deployment may require billing | Emulator/local demo with deterministic adapters |
| OpenAI key/credits | Quota or approval unavailable | Fake-AI fixtures using identical schemas |
| Google sign-in policy | Managed Workspace blocks app | Emulator teacher account for synthetic demo |
| Managed Chromebook speech | Voice availability differs | Complete text path; TTS remains optional |
| School network filters | Firebase domains blocked | Test early; preserve local rehearsal mode |

## Immediate execution order

Start with M0-01 and continue serially through M0-03. After source migration, delegate M0-04 and M0-05 in parallel with non-overlapping ownership. Integrate and commit both before M0-06.
