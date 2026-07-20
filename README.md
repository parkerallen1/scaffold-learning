# Quiz Master

Quiz Master is a teacher-guided work system for students who benefit from help starting, reading directions, remembering steps, sustaining attention, or recovering after a mistake. Teachers create assignments and approve support plans; students complete real work with only the supports approved for them.

This repository is the OpenAI Build Week education-pathway project and a synthetic-data prototype for a future school pilot. It is not a diagnostic tool, an autonomous tutor, or a production-ready student-record system.

## What works today

- Google teacher authentication, with anonymous teacher access only in the Firebase emulator.
- Teacher-owned classrooms, one-time class codes, student handles, and resettable PINs.
- Structured teacher onboarding based on observable classroom behavior, not diagnoses.
- Fixed-catalog support recommendations through a deterministic local provider or server-side OpenAI Responses API.
- Explicit teacher review, manual fallback, immutable support-plan versions, and revert.
- Teacher-authored numeric, multiple-choice, and short-text assignments.
- Server-owned publication, protected answer keys, and student targeting pinned to a plan version.
- Student assignment resume, deterministic checking, neutral retries, review-later escape, approved supports, scratch canvas, and local answer recovery.
- Read-only teacher session review for submitted responses, outcomes, timing, active supports, and support-use events.
- Deterministic evidence metrics, threshold-gated support audits, grounded suggestions, and immutable teacher decisions.
- Emulator-only synthetic evidence seeding for the Build Week audit demonstration.

The product contract is [PLAN.md](./PLAN.md). The packet-sized build roadmap is [IMPLEMENTATION.md](./IMPLEMENTATION.md).

## Safety model

- AI proposes; a teacher approves. No recommendation or audit changes a student experience automatically.
- AI can use only the typed support catalog and must cite supplied evidence.
- AI output cannot diagnose, compare students with peers, grade high-stakes work, or infer causes.
- Answer keys, PIN hashes, onboarding notes, plan history, and AI calls stay behind server boundaries.
- Browser speech synthesis handles read-aloud. No cloud speech credential is shipped to the client.
- Countdown expiry never submits or advances work.
- The Build Week demo uses synthetic student data only.

## Quick start

Prerequisites:

- Node.js 22
- npm
- Java 21 for the Firebase emulators and Firestore rules tests

```bash
git clone https://github.com/parkerallen1/quiz-master.git
cd quiz-master
npm ci
npm run setup:local
npm run emulators:start
```

Open the Hosting emulator at `http://127.0.0.1:5002`. The Emulator UI is at `http://127.0.0.1:4000`.

For the Build Week review flow, emulator class codes are assigned sequentially as `DEMO-01`,
`DEMO-02`, and so on. Every student created or reset in the emulator uses the visible PIN `1234`.
Production deployments continue to use random class codes, random PINs, and masked PIN entry.

`setup:local` creates missing ignored emulator configuration and a local-only student PIN pepper; it
never overwrites existing values. The checked-in environment template is locked to
`demo-quiz-master`; the client refuses to mix a demo project with production mode. The emulator uses
deterministic fake AI and does not send observations to OpenAI.

## Demo flow

1. Open `/teacher` and use the emulator teacher sign-in.
2. Create a classroom and save the display-once class code.
3. Create a synthetic student, then click its handle or PIN in the roster to copy it.
4. Open the student’s support-planning link from the roster.
5. Complete the structured interview, review suggestions, and approve a plan.
6. Open `/teacher/assignments`, author an activity, publish it, and assign the student.
7. In another browser profile, open `/student`, sign in, and complete the activity.
8. Open `/teacher/evidence` to inspect the completed session without exposing its answer key.
9. Return to the teacher planning screen and run the evidence audit after enough work exists.

`seedSyntheticStudentEvidence` can create the 2-session/10-response threshold history in the emulator for a targeted published assignment. It is hard-disabled outside the Functions emulator and a `demo-*` project. A small teacher UI for this callable is not yet included.

## ChatGPT/OpenAI API configuration

The application does not use a separate “ChatGPT API.” Teacher recommendations and evidence audits
run through the official OpenAI SDK and Responses API. There is no active Gemini provider, client,
credential, or dependency.

Local development always selects the fake providers. For a reviewed production deployment:

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

Set the Functions runtime variables `AI_PROVIDER=openai` and `AI_FEATURES_ENABLED=true`. The second variable is a production kill switch: live OpenAI calls remain disabled unless its value is exactly `true`. Optional overrides are `OPENAI_RECOMMENDATION_MODEL` and `OPENAI_AUDIT_MODEL`; both default to the cost-balanced `gpt-5.6-terra` tier and are centralized in the server provider files.

Never put `OPENAI_API_KEY` in `.env.local`, a `VITE_*` variable, or client source. OpenAI requests use structured outputs, `store: false`, bounded timeouts, no retries, and post-response safety validation.

Live recommendation and audit calls share a transactional per-teacher ceiling of 5 calls per minute and 50 calls per UTC day. Disabled or exhausted automation returns the existing manual teacher workflow without calling OpenAI. Operational logs contain only provider, operation, prompt version, model, status category, and latency; they exclude prompts, observations, answers, identities, provider error text, PINs, and secrets.

## Verification

```bash
npm run check
npm run firebase:validate
npm run e2e
```

`npm run check` runs formatting, lint, root/domain/Functions typechecks, the unit and component test suite, all builds, and the client-boundary secret scan. `npm run firebase:validate` runs deny-first Firestore rules tests and requires Java. CI supplies Java 21.

`npm run e2e` builds the demo and runs the two system-Chrome Playwright paths against isolated Auth,
Firestore, and Functions emulators. It requires Java 21 and Google Chrome; CI installs Java and keeps
failure traces/screenshots. See [tests/e2e/README.md](./tests/e2e/README.md).

Useful commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Vite client only |
| `npm run setup:local` | Safely prepare missing ignored emulator configuration |
| `npm run emulators:start` | Auth, Firestore, Functions, and Hosting emulators |
| `npm run test:run` | Unit/component tests except Firestore rules |
| `npm run firebase:validate` | Firestore rules tests |
| `npm run e2e` | Emulator-backed Playwright route and cross-role demo paths |
| `npm run check:provider` | Reject retired Gemini SDK, credential, or endpoint markers in active runtime boundaries |
| `npm run build` | Domain, client, and Functions production builds |
| `npm run check` | Required local quality gate |

## Repository map

```text
src/                    React routes and feature UI
functions/src/          Authorized callables and AI providers
packages/domain/src/    Shared strict schemas and deterministic logic
tests/firestore/        Firestore authorization tests
tests/e2e/              Emulator-backed Playwright demo paths
docs/adr/               Architecture decisions
PLAN.md                 Product, safety, pilot, and milestone contract
IMPLEMENTATION.md       Agent-sized execution roadmap
```

See [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), and [COMPONENTS.md](./COMPONENTS.md) for implementation details.

## Known gaps before a real pilot

- Complete the school’s privacy, consent, retention, legal, and security review.
- Test managed Google Workspace sign-in, Chromebooks, filters, and browser speech on the school network.
- Add data deletion/export and incident procedures; review the initial AI quotas against pilot usage before changing them.
- Add background offline event reconciliation; current typed answers and retry keys persist locally, but the student explicitly retries submission.
- Persist scratch work only through a future explicit opt-in evidence flow.
- Complete manual VoiceOver/ChromeVox, 200% zoom, contrast, and touch/stylus qualification.
- Add a teacher-facing synthetic seed/reset control; Playwright resets only its isolated emulator state programmatically.

Do not use real student data until those gates are complete.
