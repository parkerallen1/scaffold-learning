# Demo video talking notes

Companion to the script in [BUILD_WEEK_SUBMISSION.md](./BUILD_WEEK_SUBMISSION.md). These are
notes to talk through, not lines to read. Facts below are pulled from the repo so every claim in
the voiceover can be backed by what is on screen.

## Script-level feedback

- **Pacing.** Several voiceover blocks run 85–100 words for a 25–30 second window, which is
  3+ words per second. Comfortable narration is closer to 2.3–2.5. Cut each block to its two or
  three strongest claims and let the screen carry the rest.
- **The Codex segment names competitors.** "AI Studio and Claude Code ... stalled" spends seconds
  on tools that aren't the story. "Other AI coding workflows I tried stalled" is shorter and keeps
  the segment about continuity, which is the actual point.
- **Accuracy of the generation segment.** The plain emulator uses a *deterministic* assignment
  provider — GPT-5.6 is only in the loop when `AI_EMULATOR_LIVE_OPENAI=true` is set with a real
  key. If the recording uses the deterministic demo, don't say "GPT-5.6 turns a prompt into an
  assignment" over that footage; either record with the live emulator or phrase it as "in
  production this runs through GPT-5.6." Judges can and will check.
- **Live generation is a risk on camera.** If recording live, pre-run the prompt once so the take
  isn't hostage to latency, or keep a deterministic take as a fallback edit.
- **Two classrooms, four students.** The script only names Johnny and Sarah. One extra clause
  ("four synthetic students across two classrooms, each with a different profile") makes the demo
  feel less hand-picked.
- **The evidence audit is the most distinctive feature and it isn't in the script.** Consider
  trading 5 seconds of the Codex segment for one line: "After enough real work exists, a
  threshold-gated audit reviews whether the supports are actually helping — and even that only
  proposes; the teacher decides."
- **Submission checklist reminders** (from the same doc): voiceover must explicitly cover the
  project, Codex, and GPT-5.6; push the exact commit shown in the video; verify the YouTube link
  in a private window.

## Segment notes

### 0:00–0:20 — The problem

- Positioning in one line: a teacher-guided work system, explicitly *not* a diagnostic tool, an
  autonomous tutor, or a production student-record system. Saying what it is not builds trust fast.
- The five barriers in the script (starting, reading directions, remembering steps, attention,
  recovering from mistakes) map one-to-one to the structured observation categories teachers fill
  in — this isn't marketing language, it's the actual data model.

### 0:20–0:45 — Synthetic classrooms

Full roster if you want to point at it:

| Classroom | Student | Profile | Approved supports |
|---|---|---|---|
| Ms. Rivera's Math Lab | Johnny Carter | ADHD | Focus view, step-by-step chunks, timer off |
| Ms. Rivera's Math Lab | Sarah Nguyen | Dyslexia | Read-aloud at 0.9× speed, sentence chunks, flexible response, dyslexia-friendly font |
| Reading & Writing Workshop | Maya Brooks | Dyscalculia | 3-tier hint ladder, focus view, timer off |
| Reading & Writing Workshop | Leo Martinez | Working memory | Step chunks, 2-tier hints, optional skippable 2-minute break after 3 attempts |

- Each seeded profile includes a "never do" line a teacher wrote: Johnny — never auto-submit when
  time passes; Sarah — never start audio automatically; Maya — never reveal the answer in the
  first hint; Leo — never frame a break as a consequence. Good on-camera detail: the system
  encodes what *not* to do, per student.
- Emulator credentials are deliberately reviewable: class codes go `DEMO-01`, `DEMO-02`, every
  demo student PIN is `1234`. Production uses random codes, random PINs, masked entry.

### 0:45–1:15 — Support planning

- The catalog is exactly nine supports, frozen in code: read aloud, reading chunks, focus view,
  hint ladder, flexible response, calm pacing, break prompt, dyslexia-friendly font,
  interest-based encouragement. The AI cannot propose anything outside it.
- Every support carries a built-in caution enforced by schema, not by prompt — e.g. a countdown
  reaching zero can never submit or advance work; hint tier 1 can't reveal the answer; audio never
  autoplays. Strong sound bite: "the guardrails live in the type system, not in a prompt."
- The interview is nine optional structured questions about observable behavior. The server stores
  structured observations, never a chat transcript.
- Every AI recommendation must cite the supplied evidence it's based on and carries a rationale,
  a confidence level, and cautions. The server rejects invented evidence, diagnoses, invalid
  settings, unsafe timer behavior, malformed output, refusals, and timeouts.
- Approved plans are immutable versions. Revert creates a *new* version; history is never
  rewritten. Assignments pin students to a specific plan version, so what a student saw is always
  reconstructable.

### 1:15–1:45 — Assignment generation

- Input formats: a text prompt or an uploaded PDF, Word document, or text file.
- Model mapping if asked: assignment drafting defaults to `gpt-5.6-luna`; recommendations, IEP
  analysis, and evidence audits use the Responses API with structured outputs; read-aloud uses
  `gpt-4o-mini-tts` behind an authenticated callable with a browser-speech fallback.
- Answer keys are physically separate Firestore documents from the published questions; the client
  never receives them. Grading is deterministic server code, not a model call.
- Publication is one-way (draft → published) and server-owned; the teacher can edit every field
  before that point.

### 1:45–2:15 — Student experience

- Worth showing or naming: resume mid-assignment, neutral retry feedback, a "review later" escape
  hatch, advancing after at least one attempt regardless of correctness, and the scratch canvas
  (which stays local — it is not collected).
- Support events are only accepted for supports enabled in the pinned plan — a student can't turn
  on something the teacher didn't approve, even by manipulating the client.
- The active typed answer is cached locally so a dropped connection doesn't destroy work, and
  cleared on advance, completion, or sign-out.

### 2:15–2:40 — Codex segment

- Concrete scope Codex worked across, if you want specifics instead of a list of nouns: a
  three-package monorepo (React/Vite client, Firebase Functions, a shared `packages/domain` of
  strict Zod schemas and branded IDs used by both sides), deny-first Firestore rules with their own
  test suite, five OpenAI workflows, deterministic emulator fallbacks for all of them, and an e2e
  suite that drives both the teacher and student roles through real emulators.
- The verification story is checkable on camera: `npm run check` (format, lint, three typechecks,
  unit/component tests, builds, and a client-boundary secret scan), `npm run firebase:validate`
  (rules tests), `npm run e2e` (Playwright cross-role paths).
- Architecture decisions are written down as ADRs in `docs/adr/` — synthetic demo data, server-only
  AI with teacher approval, isolating sensitive Firestore data — useful to flash if showing the repo.

### 2:40–2:55 — Close

- The closing line already matches the safety model in the README verbatim ("AI proposes, the
  teacher decides"). Keep it.

## Backup facts for questions or description text

- **Evidence audit specifics:** the server loads at most 50 sessions/attempts/support events;
  deterministic code computes the canonical metrics; the audit only runs after a 2-session,
  10-response threshold; the AI may return at most two suggestions with exact event citations and
  conservative language; audits are append-only and cannot change a plan — a separate teacher
  decision callable creates the new plan version.
- **Student auth:** class code + handle + PIN exchanged at an App Check-protected callable for a
  narrowly scoped custom token; PINs are compared as scrypt hashes with a per-student salt and a
  server-side pepper; credentials are display-once.
- **AI operational limits:** server-only key, structured outputs, `store: false`, bounded
  timeouts, no retries, post-response safety validation, and a per-teacher ceiling of 5 calls per
  minute / 50 per UTC day. `AI_FEATURES_ENABLED` is a production kill switch; when AI is off or
  exhausted, the manual teacher workflow still works.
- **Logging:** operational logs record provider, operation, prompt version, model, status
  category, and latency only — no prompts, observations, answers, identities, or error text.
- **Honest limits** (credibility if asked): no real student data until the school's privacy,
  consent, retention, and security review is complete; accessibility qualification (VoiceOver,
  200% zoom, contrast) is still manual work outstanding; offline submission retry is explicit, not
  background-reconciled. The README lists these openly.
