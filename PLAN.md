# Quiz Master v2 — Rebuild Plan

## Context

Quiz Master today is a ~700-line React 19 + Vite + Tailwind(CDN) app: one question at a time, Gemini TTS on click, a "show your work" canvas, live-validated answer input gated on correctness, a hidden admin panel (background color, reward media, urgency timer), and Gemini-powered quiz extraction from worksheet photos/PDFs. Nothing persists, the Gemini key ships to the browser, and all logic lives in `App.tsx`.

**Goal of the rebuild:** keep the UI/feel (big white rounded card, blue/green/red feedback colors, frosted answer box, dark mode, reward modal, big timer) while turning it into a genuine learning tool for students with learning challenges — dyslexia, ADHD, math anxiety, processing/motor difficulties — with profiles, persistence, real pedagogy (hints, spaced repetition, adaptivity), and a parent/teacher dashboard.

**Execution notes:**
- Rebuild **in place** in this repo (keeps the Firebase project `quiz-master-pg` and history). Work on `main` is fine (solo repo) — commit each task as its own commit.
- Every phase ends with the app fully working and deployable. No phase leaves things half-wired.
- Preserve the existing visual design exactly unless a task says otherwise. When decomposing `App.tsx`, copy Tailwind classes verbatim.

**Target platform: Chromebooks first.** Students use this primarily on school Chromebooks (Chrome on ChromeOS). This is a favorable target — Chrome supports everything planned (`speechSynthesis` with `onboundary`, `SpeechRecognition`, IndexedDB, canvas) — but it imposes hard requirements:
- **Touch + stylus:** many Chromebooks are touchscreens/2-in-1s with styluses. The work canvas must use **Pointer Events** (not separate mouse/touch handlers) so finger, stylus, and trackpad all draw correctly, with `touch-action: none` on the canvas to stop page scroll/zoom while drawing.
- **Small screens:** the common Chromebook display is 1366×768 (and tablet-mode portrait). Every screen must be verified at 1366×768 — the `min-h-[85vh]` card, floating answer box, and canvas must not collide or require scrolling mid-question.
- **Low-end hardware:** budget Celeron/MediaTek machines. Keep the bundle small (no heavy chart/animation libs), avoid layout-thrashing animations, and prefer CSS transforms.
- **School-managed devices/networks:** content filters can block unknown domains. All assets must be served from our own Firebase Hosting origin (fonts bundled locally, no CDNs — already planned) and API calls go only to our Firebase project's domains. Audio only ever plays from a user gesture (already the pattern) so autoplay policies never bite.
- **Per-student ChromeOS logins:** each student's Google login on a Chromebook gets its own Chrome storage, so IndexedDB data is naturally separated per student on shared devices. Caveat: data does **not** follow a student to a different Chromebook — that's the trigger for the optional Firestore sync extension (Phase 3+), noted below.

**Decisions assumed (flag to Parker if wrong):**
1. **Local-first persistence** via IndexedDB (Dexie). No accounts/login; profiles are device-local. On school Chromebooks each student's ChromeOS login already isolates storage, so this is safe on shared carts — but data doesn't follow a student across devices. Firestore sync is the Phase 3+ extension if students rotate Chromebooks day to day.
2. **In-app AI runs on the OpenAI API** — swapped from Gemini because this is the OpenAI Build Week submission (see Hackathon section below): GPT vision for worksheet extraction and canvas reading, GPT for hints/diagnosis/variants/quiz generation, OpenAI TTS for the premium voice. The **API key moves behind Firebase Functions** (callable functions), which requires the Firebase **Blaze plan** (pay-as-you-go; effectively free at this usage). If Blaze is a no-go before the deadline, fallback: client-side key behind the existing password gate, treated as disposable/rotatable, with a note in the README — acceptable for the hackathon demo, fix after.
3. **Dual TTS engines:** browser `speechSynthesis` becomes the default (free, offline, and its `onboundary` events enable word-by-word read-along highlighting); **OpenAI TTS** is the high-quality voice option (no highlighting). Browser-default also matters because hackathon credits are exhausted — every AI response gets cached and the free voice does the everyday work.

---

## Phase 1 — Foundations & core loop

*Turn the prototype into a real app: proper project structure, persistence, profiles, saved quizzes, generalized answers, kinder feedback, secured API key. UI unchanged.*

### 1.1 Project restructure
- Move source into `src/`: `src/components/`, `src/services/`, `src/stores/`, `src/db/`, `src/lib/`, `src/types.ts`.
- Install Tailwind properly (Tailwind v4 via `@tailwindcss/vite` plugin, or v3 + PostCSS — either is fine): remove the CDN `<script>` and the `aistudiocdn.com` importmap from `index.html`; add React/`@google/genai` as normal bundled deps. Keep `darkMode: 'class'` behavior.
- Decompose `App.tsx` (509 lines) into components, preserving markup/classes verbatim:
  - `QuestionCard` (question text + speaker + optional data table)
  - `WorkCanvas` (drawing canvas + Clear; fix: stroke color should be theme-aware so it's visible on the dark canvas `dark:bg-gray-700`; **rewrite input handling on Pointer Events** with `touch-action: none` so finger/stylus/trackpad all work on Chromebook touchscreens)
  - `AnswerPanel` (the floating frosted input card + Next button)
  - `SettingsPanel` (the current "admin" modal, extended over later phases)
  - `TimerDisplay`, `RewardModal`, `CompletionScreen`, `PasswordGate`, `SpeakerIcon`
- State management: two Zustand stores — `useSessionStore` (current quiz run: questions, index, attempts, correctness, timer) and `useSettingsStore` (per-profile settings, hydrated from DB). Keep component-local state local (canvas drawing, input text).
- Tooling: Vitest + React Testing Library; `npm test` script. First tests: answer checking (1.3) once it exists.

### 1.2 Data model (src/types.ts)
```ts
interface Question {
  id: string;                       // uuid, not numeric index
  prompt: string;
  acceptedAnswers: string[];        // any match = correct (kills the hardcoded id-12 hack)
  answerType: 'text' | 'numeric' | 'multipleChoice';
  tolerance?: number;               // numeric: |given - expected| <= tolerance
  choices?: string[];               // multipleChoice
  data?: { type: 'table'; headers: string[]; rows: (string|number)[][] };
  hints?: string[];                 // tiered, Phase 2
  steps?: { prompt: string; acceptedAnswers: string[] }[];  // scaffold, Phase 3
  topic?: string; difficulty?: 1|2|3;
}
interface Quiz { id: string; name: string; tags: string[]; createdAt: number; source: 'seed'|'upload'|'topic'; questions: Question[]; }
interface Profile { id: string; name: string; avatarColor: string; settings: ProfileSettings; createdAt: number; }
interface ProfileSettings { backgroundColor: string; timerMode: 'off'|'countdown'|'visual'|'stopwatch'; timerSeconds: number;
  rewardEnabled: boolean; ttsEngine: 'browser'|'openai'; ttsRate: number; fontFamily: 'default'|'lexend'|'opendyslexic';
  fontScale: number; letterSpacing: 'normal'|'wide'; chunkedReading: boolean; focusMode: boolean; feedbackStyle: 'instant'|'submit'; }
interface Attempt { id: string; profileId: string; quizId: string; questionId: string; givenAnswer: string;
  correct: boolean; hintsUsed: number; msElapsed: number; timestamp: number; }
```
- Migrate `constants.ts` seed questions to this shape (question 12's two orderings become two `acceptedAnswers` entries).

### 1.3 Generalized answer checking (`src/lib/checkAnswer.ts`)
- Pure function: normalize (trim, lowercase, collapse whitespace, strip commas), compare against `acceptedAnswers`; numeric type parses both sides and applies `tolerance` (default 0); `$`/`%` symbols optional on numeric answers.
- Delete the bespoke id-12 branch from the old `handleAnswerChange`.
- Unit-test heavily (Vitest): decimals, money, whitespace, either-order cases, tolerance.

### 1.4 Persistence layer (`src/db/` — Dexie/IndexedDB)
- Tables: `profiles`, `quizzes`, `attempts`, `srsCards` (schema now, used in Phase 3), `media` (reward files as Blobs so rewards survive reload).
- Thin repository module (`src/db/repo.ts`) so components never touch Dexie directly.

### 1.5 Student profiles
- Profile picker screen after the password gate (big tappable cards, name + color avatar; "New student" flow). Selected profile persists in `localStorage` for auto-resume.
- All settings currently in the admin panel (background, timer, reward media) become per-profile and persist via `useSettingsStore` → DB.
- Replace the type-the-word-"admin" mechanism with a 4-digit PIN prompt on the gear button (default PIN stored in DB, changeable in settings). Keep the existing `PasswordGate` for app entry.

### 1.6 Quiz library
- Save AI-extracted quizzes (from worksheet upload) with a name + tags instead of losing them on refresh.
- Library screen in the settings panel: list / rename / delete / start; "seed" quiz always available.
- Starting a quiz records which profile is playing (attempts reference profileId + quizId).

### 1.7 Submit-based, gentler feedback
- Add `feedbackStyle` setting: keep current keystroke-instant mode as an option, but default to **submit mode**: student presses Check (or Enter); wrong answers get an encouraging message ("Not yet — take another look!") rather than an instant red border on every keystroke. Correct keeps the green celebration + Next button.
- Count attempts per question into `attempts` table (foundation for hints/diagnosis in Phase 2 and dashboard in Phase 3).

### 1.8 OpenAI API behind Firebase Functions
- `functions/` (Node 20, TypeScript): two callable functions — `tts(text, voice)` (OpenAI TTS) and `extractQuiz(base64, mimeType)` (GPT vision with structured outputs / JSON schema — replaces the old Gemini logic in `services/geminiService.ts`, which gets deleted); key lives in Functions secrets (`firebase functions:secrets:set OPENAI_API_KEY`).
- Client `src/services/ai.ts` calls the functions via the Firebase JS SDK; remove the `define` block exposing the key in `vite.config.ts`.
- Add App Check or at minimum keep the password gate + basic rate limiting in the function.

### Phase 1 verification
- `npm run dev`: password gate → profile picker → seed quiz plays identically to v1 (TTS, canvas, timer, rewards, backgrounds all work per profile).
- Upload a worksheet photo → quiz extracts → save to library → **reload the page** → quiz and profile settings are still there.
- `npm test` green (checkAnswer suite); `npm run build` succeeds with no CDN references; deployed function TTS works with no API key string anywhere in `dist/`.
- **Chromebook check:** at a 1366×768 viewport (Chrome devtools responsive mode, then a real Chromebook if available) the full flow works with no mid-question scrolling; canvas draws with touch and stylus; the entire deployed app loads with devtools request-blocking of all third-party domains enabled (proves no external assets for school filters to break).

---

## Phase 2 — Accessibility & learning supports

*The learning-challenge features: read-along TTS, dyslexia-friendly text, hints instead of walls, mistake diagnosis, multiple answer modes, calmer pacing.*

### 2.1 Read-along TTS with word highlighting
- `src/services/tts.ts` with two engines behind one interface: `browser` (default — `speechSynthesis`, `onboundary` events drive a highlighted `<span>` per word in `QuestionCard`, karaoke-style) and `openai` (OpenAI TTS high-quality voice, no highlighting).
- Speed control (0.5×–1.2×) and a replay button in the question card; per-profile `ttsRate`/`ttsEngine` settings.

### 2.2 Text presentation settings (per profile)
- Bundle **Lexend** and **OpenDyslexic** fonts locally (no CDN); font choice + size scale (1×–1.5×) + wide letter/line spacing toggles applied to the question card.
- **Chunked reading mode:** long word problems reveal one sentence at a time with a "next line" tap; TTS reads the visible chunk.

### 2.3 Hint ladder (soften the hard gate)
- `hints: string[]` (3 tiers) on each question. For AI-extracted quizzes, generate hints at extraction time (extend the `extractQuiz` prompt/schema); for the seed quiz, hand-write them.
- UI: after 1 wrong submit, a "Hint?" button appears; each press reveals the next tier (restate → first step → worked similar example). Hints used are recorded on the attempt.
- After all hints + 2 more wrong attempts: "Show me the answer" appears; question is marked **needs-review** (feeds Phase 3 spaced repetition) and the student may proceed. No more infinite walls.

### 2.4 Mistake diagnosis
- On a wrong submit (submit mode only), call a new `diagnose(question, givenAnswer)` callable function → GPT returns one encouraging, specific sentence ("You added before multiplying — try the multiplication first."). Show it under the answer box; cache per (question, answer) to avoid repeat calls; fall back silently to the generic message on error.

### 2.5 Simplify / rephrase
- Button on the question card: `simplify(question)` function → GPT rewrites in simpler language (same numbers, same answer). Show below the original; TTS can read the simplified version. Cache per question.

### 2.6 Multiple answer modes
- **Multiple choice rendering:** `answerType: 'multipleChoice'` renders 2–4 large tappable choice buttons in place of the text input (same frosted card styling). `extractQuiz` schema optionally emits choices; settings toggle "convert quiz to multiple choice" asks GPT to generate distractors for an existing quiz.
- **Voice answers:** mic button on the answer box using the Web Speech API (`SpeechRecognition`); transcript lands in the input for normal checking. Feature-detect; hide the mic where unsupported (Firefox). Works in Chrome/ChromeOS — but note school admin policy can disable mic access on managed Chromebooks, so this must degrade gracefully (mic button hidden or showing a friendly "mic not available" note, never an error).

### 2.7 Focus & pacing
- **Focus mode** (per profile): hides question counter, gear, and timer chrome — just the question, canvas, and answer box.
- **Timer modes** replacing the single countdown: `off` / `countdown` (existing giant digits) / **`visual`** (classic "Time Timer" shrinking colored disc, SVG, no digits — far less anxiety-inducing) / `stopwatch` (counts up quietly, small, records `msElapsed` only). Timer expiry in countdown/visual marks needs-review and advances (current behavior).
- **Brain breaks:** every N questions (setting, default off), a full-screen interstitial ("Stand up and stretch! 🎉", 30s visual timer, Skip button).

### 2.8 Accommodation presets
- One-tap bundles on the profile settings screen that set multiple toggles:
  - **Reading support:** browser TTS + highlighting on, Lexend, 1.25× font, chunked reading.
  - **Focus support:** focus mode, visual timer, brain breaks every 5 questions.
  - **Low pressure:** submit feedback, timer off, hints available immediately, extra-encouraging feedback copy.
- Presets are starting points — individual toggles remain editable after applying.

### Phase 2 verification
- Read-along: words highlight in sync with browser TTS at 0.75× on a long word problem; OpenAI voice still works as the alternate engine.
- Wrong answer twice → hint ladder appears tier by tier → "Show me" path advances and flags the question; diagnosis sentence appears for a plausible mistake (e.g. answering `100.42` to `25.14 + 76.38` from misaligned decimal addition).
- Each preset applies its toggles; multiple-choice quiz renders buttons; mic input works in Chrome and degrades gracefully when mic permission is denied; visual timer disc shrinks smoothly; all settings persist per profile across reload.
- **Chromebook check:** read-along highlighting, chunked reading, and multiple-choice buttons all usable by touch at 1366×768; larger font scales (1.5×) don't break the card layout at that size.

---

## Phase 3 — Adaptivity, mastery & dashboard

*Make it actually teach: missed material comes back until mastered, difficulty adapts, and the parent/teacher can see what's happening.*

### 3.1 Spaced repetition (Leitner)
- `srsCards` table: `(profileId, questionId) → box (1–5), dueAt, lapses`. Correct-no-hints moves up a box; wrong or "shown answer" drops to box 1. Box intervals: 0d / 1d / 3d / 7d / 14d.
- **In-session requeue:** a missed question re-enters the queue 2–3 questions later (not immediately) until answered correctly.
- **Warm-up deck:** starting any quiz first offers due review cards for that profile ("3 review questions first!") — skippable by the adult, on by default.

### 3.2 Similar-problem generator
- After a miss (or from the hint ladder's "worked example" tier), `generateVariant(question)` function → GPT produces the same problem shape with different numbers + answer + hints. Passing the variant clears the needs-review flag ("prove you've got it").
- Validate the variant server-side (schema check; for numeric questions, sanity-check the answer parses).

### 3.3 Adaptive difficulty
- Session-level rule engine in `useSessionStore`: 3-correct streak with no hints → next AI-generated question may be a harder variant (difficulty+1); 2 misses in a row → easier variant. Only applies to quizzes the adult marks "adaptive: on"; fixed worksheets stay fixed.

### 3.4 Step scaffold mode
- Use `steps[]` on questions: a "Break it down" button (or auto-offer after hints exhausted) walks the student through sub-answers one at a time, each with its own small input + check, then the final answer. Generate steps at quiz-extraction time alongside hints.

### 3.5 Handwriting answer recognition
- "Check my work" button next to Clear: exports the canvas PNG, sends to a `readWork(imageBase64, question)` function (GPT vision) → returns the final answer it sees (student is told to circle it). Fills the answer box for normal checking — the canvas becomes an input path for dysgraphic/keyboard-averse kids, not just scratch space.

### 3.6 Progress dashboard
- New section in the PIN-protected settings area, per profile: accuracy over time (line), time-per-question trend, hints used, needs-review list, weak topics (roll up `attempts` by `question.topic`). Charts with plain SVG or a tiny chart lib — match the existing card styling.
- "Session recap" card for the student on the completion screen: X correct, best streak, badges (gentle, no grades/percentages in kid view).
- Charts must stay lightweight (plain SVG preferred) — the dashboard runs on the same low-end Chromebooks.

### 3.7 Topic-prompt quiz generation
- In the library: "Generate from topic" — free-text prompt ("10 questions, 5th grade decimal division, word problems") → `generateQuiz(prompt)` function returns full Question objects **including hints, steps, choices, topic, difficulty** in one call. Saves straight to the library.
- Also backfill: a "Enhance quiz" action that generates missing hints/steps for older saved quizzes.

### 3.8 Streaks & micro-rewards
- Thin progress bar at the top of the card filling per correct answer; streak counter with confetti burst (small dependency like `canvas-confetti` or hand-rolled) at 3/5/10 streaks; reward-media system extended to trigger per-streak instead of only per-question. Respect `prefers-reduced-motion`.

### Phase 3 verification
- Miss a question → it returns 2–3 questions later; complete session, reopen **next day** (or fake `dueAt` in devtools) → warm-up offers it; answer correctly twice across sessions → box advances and it stops appearing.
- Variant generation produces a solvable, different-numbers problem; scaffold mode walks through steps; circled `101.52` on the canvas is read correctly and checked.
- Dashboard reflects a real session's attempts; topic-generated quiz plays end-to-end with hints and choices present; confetti respects reduced-motion.

---

## Sizing & order

Phases are strictly sequential; within a phase, tasks are ordered by dependency (1.1→1.4 before 1.5+; 2.1/2.2 independent of 2.3–2.5; 3.1 before 3.2/3.3). Rough effort: Phase 1 is the biggest lift (restructure + persistence + functions), Phase 2 is many small independent features, Phase 3 is medium but logic-heavy (SRS + dashboard).

Commit per task (e.g. `1.3: generalized answer checking + tests`). Deploy to Firebase Hosting at the end of each phase.
