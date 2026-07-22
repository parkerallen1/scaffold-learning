# Scaffold Learning

Scaffold Learning is a teacher-guided work system for students who benefit from help starting, reading directions, remembering steps, sustaining attention, or recovering after a mistake. Teachers create assignments and approve support plans; students complete real work with only the supports approved for them.

This repository is the OpenAI Build Week education-pathway project and a synthetic-data prototype for a future school pilot. It is not a diagnostic tool, an autonomous tutor, or a production-ready student-record system.

## What works today

- Google teacher authentication plus a public anonymous Build Week demo workspace.
- Teacher-owned classrooms, copyable class codes, generated student handles, and teacher-visible PINs.
- Structured teacher onboarding based on observable classroom behavior, not diagnoses.
- Fixed-catalog support recommendations through a deterministic local provider or server-side OpenAI Responses API.
- Explicit teacher review, manual fallback, immutable support-plan versions, and revert.
- Per-student interest encouragement using teacher-authored text and teacher-uploaded images or audio.
- Teacher-authored assignments plus editable AI drafts from a prompt, PDF, DOCX, or text file.
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
- OpenAI TTS runs behind an authenticated callable and falls back to browser speech. No cloud speech credential is shipped to the client.
- Countdown expiry never submits or advances work.
- The Build Week demo uses synthetic student data only.

## Quick start

Prerequisites:

- Node.js 22
- npm
- Java 21 for the Firebase emulators and Firestore rules tests

```bash
git clone https://github.com/parkerallen1/scaffold-learning.git
cd scaffold-learning
npm ci
npm run setup:local
npm run emulators:start
```

Open the Hosting emulator at `http://127.0.0.1:5002`. The Emulator UI is at `http://127.0.0.1:4000`.
The hosted Build Week demo is available at [quiz-master-pg.web.app](https://quiz-master-pg.web.app).

For this Build Week version, class codes are assigned sequentially as `DEMO-01`, `DEMO-02`, and so
on. Every student created or reset uses the teacher-visible PIN `1234`. Teachers can copy the class
code, generated student handle, and PIN directly from the roster. Keep all demo data synthetic.

`setup:local` creates missing ignored emulator configuration and a local-only student PIN pepper; it
never overwrites existing values. The checked-in environment template is locked to
`demo-scaffold-learning`; the client refuses to mix a demo project with production mode. The emulator uses
deterministic AI by default and does not send observations to OpenAI unless live local AI is explicitly
enabled as described below.

## Demo flow

1. Open the [hosted app](https://quiz-master-pg.web.app), select **Teacher**, and choose **Explore the
   demo**. No credentials are required. The same flow is available locally at
   `http://127.0.0.1:5002/teacher` after starting the emulators.
2. Explore either of the two pre-populated synthetic classrooms. Each contains two students with
   different learning profiles and approved supports.
3. Copy a class code, student handle, or PIN directly from the roster, or create another synthetic
   classroom or student.
4. Choose **Demo student’s experience** to see the student greeting and approved accommodations, or
   open **Plan supports** to inspect and edit the active plan.
5. Complete or review the multiple-choice observation interview, upload a synthetic IEP, review
   suggestions, and approve a plan. Interest-based
   encouragement can include text plus up to eight teacher-uploaded images or audio clips.
6. Open `/teacher/assignments`, author an activity, publish it, and assign the student.
7. In another browser profile, open `/student`, sign in, and complete the activity.
8. Open `/teacher/evidence` to inspect the completed session without exposing its answer key.
9. Return to the teacher planning screen and run the evidence audit after enough work exists.

`seedSyntheticStudentEvidence` can create the 2-session/10-response threshold history in the emulator for a targeted published assignment. It is hard-disabled outside the Functions emulator and a `demo-*` project. A small teacher UI for this callable is not yet included.

## ChatGPT/OpenAI API configuration

The application does not use a separate “ChatGPT API.” Teacher recommendations, evidence audits,
IEP analysis, assignment drafting, and read-aloud run through the official OpenAI SDK. There is no
active Gemini provider, client, credential, or dependency.

Local development selects deterministic providers by default. To use the real OpenAI integrations in
the emulator, keep the API key only in `functions/.secret.local` and set the following in the ignored
`functions/.env.local` file, then restart the emulator:

```dotenv
AI_PROVIDER=openai
AI_FEATURES_ENABLED=true
AI_EMULATOR_LIVE_OPENAI=true
```

This enables live support recommendations, IEP analysis, assignment drafting, evidence audits, and
text-to-speech. These requests consume API usage. Set `AI_EMULATOR_LIVE_OPENAI=false` to return to the
deterministic demo.

### Optional reviewer path: test real OpenAI results

The application is fully usable with its deterministic provider, so reviewers do not need an API
key. Reviewers who want to exercise the real integrations can use a key from their own OpenAI API
project. API usage and any associated charges belong to that project.

1. Create an API key from the [OpenAI API keys page](https://platform.openai.com/api-keys). Make sure
   the API project has available usage or billing.
2. Run `npm ci` and `npm run setup:local` from the repository root.
3. Open the ignored `functions/.secret.local` file and replace only its `OPENAI_API_KEY=` line:

   ```dotenv
   OPENAI_API_KEY=your_api_key_here
   ```

   Leave the generated `STUDENT_PIN_PEPPER` value in place.
4. Set these values in the ignored `functions/.env.local` file:

   ```dotenv
   AI_PROVIDER=openai
   AI_FEATURES_ENABLED=true
   AI_EMULATOR_LIVE_OPENAI=true
   ```

5. Start or restart the app with `npm run emulators:start`, then open
   `http://127.0.0.1:5002`. Use only synthetic student data and documents.
6. Try one or more live workflows:
   - complete a teacher observation interview and request support recommendations;
   - upload a synthetic IEP and create a profile draft;
   - generate an editable assignment from a prompt or supported document;
   - use read-aloud in a student demo; or
   - run an evidence audit after enough synthetic work exists.
7. A successful server log includes `"provider":"openai"` and `"status":"completed"`. The key
   never appears in that log or in the browser bundle.

Do not use `npm run e2e` to verify live output. The automated browser suite deliberately forces the
fake provider so it remains repeatable, offline-capable, and free of API charges. If a manual live
request fails, confirm the three switches above, API project usage, and key value, then restart the
emulators. After testing, set `AI_EMULATOR_LIVE_OPENAI=false` or remove the local key.

OpenAI recommends storing API keys in environment variables or a server-side secret manager rather
than source code or a public repository; see the
[OpenAI production best practices](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys).

For a reviewed production deployment:

```bash
firebase functions:secrets:set OPENAI_API_KEY --project quiz-master-pg
firebase functions:secrets:set STUDENT_PIN_PEPPER --project quiz-master-pg
```

Create the ignored `functions/.env.quiz-master-pg` file with `AI_PROVIDER=openai` and
`AI_FEATURES_ENABLED=true`. The second variable is a production kill switch: live OpenAI calls
remain disabled unless its value is exactly `true`. `npm run build:functions-deploy` creates the
self-contained, ignored `functions-deploy` source directory used by Firebase; do not edit that
generated directory directly. Assignment drafting defaults to `gpt-5.6-luna`, read-aloud uses
`gpt-4o-mini-tts`, and the other reviewed AI workflows keep their server-side defaults. Optional
model overrides include `OPENAI_ASSIGNMENT_MODEL`, `OPENAI_RECOMMENDATION_MODEL`,
`OPENAI_AUDIT_MODEL`, and `OPENAI_IEP_MODEL`.

The production browser configuration belongs in the ignored file
`<repository-root>/.env.production.local`. Its `VITE_*` Firebase and App Check values are public
client configuration; never put either server secret in that file.

Never put `OPENAI_API_KEY` in `.env.local`, a `VITE_*` variable, or client source. OpenAI requests use structured outputs, `store: false`, bounded timeouts, no retries, and post-response safety validation.

Live recommendation and audit calls share a transactional per-teacher ceiling of 5 calls per minute and 50 calls per UTC day. Disabled or exhausted automation returns the existing manual teacher workflow without calling OpenAI. Operational logs contain only provider, operation, prompt version, model, status category, and latency; they exclude prompts, observations, answers, identities, provider error text, PINs, and secrets.

## Built with Codex and GPT-5.6

Scaffold Learning was built during OpenAI Build Week in an ongoing Codex collaboration using
GPT-5.6. Codex was instrumental in getting it across the finish line. I had tried to build the idea
in several other ways, including AI Studio and Claude Code, but those attempts stalled for different
reasons. Codex was the first workflow that let me carry the product all the way from an evolving idea
to an end-to-end web application that I could repeatedly run, inspect, test, and improve.

That continuity mattered because Scaffold Learning is not a single model call or a thin interface.
The teacher and student experiences, Firebase backend, privacy boundaries, support-plan logic, and
the different OpenAI API workflows all have to agree with one another. Codex helped turn that whole
system into a working vertical slice by:

- translating teacher feedback and annotated screenshots into small, reviewable product changes;
- designing the teacher, student, support-planning, assignment, and evidence workflows as one
  coherent experience;
- implementing typed Firebase boundaries, Firestore authorization rules, OpenAI structured-output
  adapters, and deterministic emulator providers;
- pressure-testing safety decisions, including teacher approval before supports go live, synthetic
  demo data, server-only answer keys and credentials, and a manual fallback when AI is unavailable;
- writing and running the verification suite while committing each logical change separately.

The ability to work across the entire repository was especially important for integrating different
OpenAI capabilities for different jobs: structured support recommendations, IEP document analysis,
assignment generation, evidence review, and text-to-speech. Codex helped implement those server-side
paths, connect them to editable teacher workflows, and test the deterministic fallbacks and safety
boundaries around them. That end-to-end building and testing loop was necessary to make the app feel
like one usable product instead of a collection of disconnected AI demos.

The most important product decision was to keep AI in a proposal role. GPT-5.6 can help extract an
IEP draft, recommend supports from a fixed catalog, draft assignments, and audit evidence, but a
teacher reviews and approves every student-facing change. For a reliable and privacy-safe review,
the included emulator uses deterministic providers and pre-populated synthetic classrooms. The
production adapters demonstrate how the same reviewed workflows connect to the OpenAI Responses and
text-to-speech APIs without exposing an API key to the browser.

## Verification

```bash
npm run check
npm run firebase:validate
npm run e2e
```

`npm run check` runs formatting, lint, root/domain/Functions typechecks, the unit and component test
suite, all builds, and the client-boundary secret scan. `npm run firebase:validate` runs deny-first
Firestore rules tests and requires Java.

`npm run e2e` builds the demo and runs the two system-Chrome Playwright paths against isolated Auth,
Firestore, and Functions emulators. It requires Java 21 and Google Chrome and keeps local failure
traces/screenshots. See [tests/e2e/README.md](./tests/e2e/README.md).

Useful commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Vite client only |
| `npm run setup:local` | Safely prepare missing ignored emulator configuration |
| `npm run emulators:start` | Auth, Firestore, Functions, Storage, and Hosting emulators |
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

## License

Scaffold Learning is available under the [MIT License](./LICENSE).
