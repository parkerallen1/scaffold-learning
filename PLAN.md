# Quiz Master v2 — Product and Build Plan

## 1. Product thesis

Quiz Master is a teacher-guided work system for students who have trouble getting started, staying with a problem, reading directions, organizing multi-step work, or recovering after a mistake. It should help a student complete real teacher-assigned work with the least intrusive support that is useful.

The product is not an autonomous tutor, a diagnostic tool, or a behavior-monitoring system. The teacher owns assignments and support plans. AI may extract content, propose supports, explain patterns, and draft next steps, but a teacher approves anything that changes a student's experience.

The core product loop is:

1. A teacher creates a student and describes observable learning needs and successful strategies.
2. The app recommends a small, explainable starter support plan from a fixed catalog.
3. The teacher reviews, edits, and approves that plan.
4. The teacher assigns work; the student completes it using the approved supports.
5. The app records learning evidence and support use.
6. After enough evidence exists, the app proposes one or two support-plan adjustments for teacher review.

That complete loop—not the number of accessibility toggles—is the Build Week product.

---

## 2. Current repository assessment

The existing app is a useful visual and interaction prototype:

- React 19 + Vite + TypeScript, deployed as a static Firebase Hosting app.
- One-question-at-a-time runner with a scratch canvas.
- Gemini-powered text-to-speech and worksheet extraction.
- Immediate exact-match answer checking.
- A hidden settings panel with a timer, background choice, and uploaded reward media.
- A student-facing password gate.

It is not yet a safe foundation for a classroom product:

- Most behavior lives in a single 509-line `App.tsx`.
- The Gemini API key is compiled into the browser bundle.
- Passwords are hard-coded in client source and are not authentication.
- There is no teacher/student ownership model, database, authorization, or audit trail.
- Student work, settings, and progress do not persist.
- Open-response answers are exact string matches; incorrect AI extraction could make a task impossible.
- Timers can auto-advance, which can remove a student's opportunity to finish.
- There are no automated tests, accessibility checks, analytics, or privacy/retention controls.
- The older README, architecture, component, and API documents describe the prototype and must be updated as implementation changes.

The current UI should be preserved where it serves the new workflow, but existing implementation details are not constraints.

---

## 3. Product goals and success measures

### Build Week goals

The demo must prove one coherent story with synthetic students and assignments:

- A new teacher can create a class and one student in under 3 minutes.
- Teacher onboarding produces 2–4 recommended supports, each with a plain-language rationale and editable settings.
- No recommendation changes a student's experience until the teacher approves it.
- A student can join, complete an assigned 5-question activity, use at least two supports, and finish without being trapped by a wrong answer.
- The teacher can open a session review showing attempts, time, support use, and work samples.
- With sufficient seeded evidence, the audit can recommend one support-plan change and cite the observations behind it.
- The full demo works at 1366×768 on Chrome with keyboard and touch input.
- No model credential or teacher credential appears in the client bundle.

### Pilot goals

Targets should be finalized with the school before a real pilot. Initial hypotheses:

- At least 80% of started assignments are completed.
- Students recover from at least 60% of first incorrect attempts without an adult taking over.
- Teachers can review and assign an imported activity in under 5 minutes.
- Teachers accept or deliberately edit at least 50% of support recommendations; silent automatic application remains 0%.
- Fewer than 5% of published extracted questions require correction after teacher preview.
- Student and teacher task-completion flows meet WCAG 2.2 AA for the supported browser.

Metrics are for improving the product, not ranking students. Student-facing views should emphasize progress and strategy use rather than grades or comparison with peers.

---

## 4. Explicit non-goals

These are out of scope for Build Week:

- Diagnosing dyslexia, ADHD, anxiety, a disability, or an educational placement.
- Ingesting IEPs, medical records, discipline records, or other sensitive documents.
- Automatically changing accommodations, grading, or making high-stakes educational decisions.
- A fully autonomous chatbot or open-ended student companion.
- District SIS/LMS integration, rostering, billing, parent accounts, or multi-school administration.
- Perfect grading of essays or handwritten reasoning.
- General adaptive curriculum generation across every subject and grade.
- Spaced repetition, mastery algorithms, badges, confetti, and reward-media uploads until the core teacher-guided loop is validated.
- OpenAI TTS as a requirement; browser speech is sufficient for the first version.

For the Build Week demo, use synthetic student data only. A real-school pilot has a separate readiness gate in section 12.

---

## 5. Users and permissions

### Teacher

- Creates classes, students, assignments, and support plans.
- Reviews all AI-created questions and answers before publishing.
- Approves, rejects, or edits support recommendations.
- Reviews student evidence and audit suggestions.
- Can pause an assignment, reset a student PIN, export a summary, or delete student data.

### Student

- Joins a class with a short class code and a student-specific PIN or QR card.
- Sees only their own assignments and progress.
- Uses the supports approved for them and can hide a non-required support for the current problem.
- Can ask for help, a break, or teacher attention.
- Never sees disability labels, inferred diagnoses, peer comparisons, or hidden teacher notes.

### System

- Enforces authorization in backend rules, not just in the UI.
- Records who approved support-plan changes and when.
- Uses AI only through server-side endpoints with schemas, limits, and logging.

---

## 6. Core experience specifications

### 6.1 Teacher-guided student onboarding

Onboarding should feel like a short, one-question-at-a-time conversation with ChatGPT, while saving structured answers behind the scenes. It should ask about observable barriers and what helps, not demand a diagnostic label. A teacher may optionally record a teacher-known accommodation, but the model should not infer or restate a diagnosis.

Suggested interview topics:

1. What kinds of work does the student usually start independently?
2. Where do they most often get stuck: reading directions, starting, remembering steps, calculation, writing/typing, sustaining attention, or handling mistakes?
3. What does getting stuck look like in the classroom?
4. Which strategies already help?
5. Are timers calming, neutral, or stressful for this student?
6. How does the student prefer to respond: typing, selecting, speaking, handwriting, or a mix?
7. How much adult prompting is typically needed?
8. What interests, language preferences, or sensory considerations are useful to know?
9. What should the app never do for this student?

The teacher may skip any question and edit a concise summary before sending it to AI. The saved profile should prefer structured observations over a raw conversation transcript.

AI output must use a structured `SupportRecommendation[]` schema:

```ts
interface SupportRecommendation {
  supportKey: SupportKey;
  settings: Record<string, string | number | boolean>;
  rationale: string;
  basedOn: string[];        // teacher observations, quoted briefly
  confidence: 'low' | 'medium' | 'high';
  cautions: string[];
  status: 'proposed' | 'approved' | 'rejected';
}
```

Acceptance criteria:

- The model can only recommend supports from the fixed catalog in section 7.
- Every recommendation states what observation led to it.
- The onboarding screen says that suggestions are not a diagnosis.
- Recommendations start in `proposed` state.
- The teacher can preview the exact student experience, edit each setting, approve supports individually, and undo later.
- The student cannot access teacher notes or the raw onboarding input.
- If AI fails, the teacher can configure the same supports manually.

### 6.2 Assignment creation and review

The Build Week core supports two reliable sources:

- A known seed assignment for a reliable demo.
- A small teacher-authored assignment form for numeric, multiple-choice, and short-text questions.

Worksheet image/PDF extraction with the OpenAI Responses API and structured outputs is the first stretch feature below the submission cut line. It follows the same review-and-publish rules.

Extraction is a draft workflow:

1. Upload a document.
2. Extract question text, response type, answer/rubric, and source-page reference.
3. Show a teacher preview with validation warnings.
4. Teacher edits and explicitly publishes.

Question types for v1:

- `numeric`: deterministic comparison with optional tolerance and unit rules.
- `multipleChoice`: deterministic choice ID comparison.
- `shortText`: normalized accepted answers, with a teacher-review escape hatch.

Free-form essays and automatic grading are out of scope. AI may draft hints, but the teacher sees and approves them with the question.

Acceptance criteria:

- No extracted assignment reaches a student without teacher publication.
- Questions with a missing answer, duplicate choice, invalid tolerance, or low-confidence extraction are blocked from publication.
- A teacher can mark a correct student answer as accepted when normalization misses it.
- The file and extracted content have explicit retention and deletion behavior.

### 6.3 Student work session

The default flow is calm and submit-based:

1. Show one problem and only the controls needed for it.
2. Let the student read, listen, draw, or choose an answer mode.
3. On submit, use deterministic checking when possible.
4. If incorrect, give neutral feedback and offer the next approved support.
5. After the configured attempt threshold, allow “I need help” or “Show and review later.” Never create an infinite correctness gate.
6. Save progress after every meaningful event and resume after refresh.

Timer behavior must change from the prototype: timers are off by default; expiry never auto-submits or auto-advances. A visual timer may notify the student or teacher while preserving the student's work.

Acceptance criteria:

- Keyboard-only, pointer, touch, and stylus paths work.
- The scratch canvas uses Pointer Events, `touch-action: none`, and retains work when the viewport changes.
- The student can pause and resume an incomplete assignment.
- Losing the network does not erase the current answer or canvas.
- AI failure never blocks the core quiz loop.
- Reduced-motion, text scaling, visible focus, contrast, and screen-reader labels are verified.

### 6.4 Evidence review and support audit

The audit answers: “Based on recent work, which approved support might we keep, adjust, add, or remove?” It does not answer: “What condition does this student have?”

Evidence available to the audit:

- Completion and abandonment.
- Attempts before success.
- Time on task compared with the same student's recent baseline, not peers.
- Hints requested and the tier at which the student recovered.
- Use of read-aloud, chunking, alternate response, breaks, and focus mode.
- Performance before and after a support was used.
- Teacher-reviewed work samples and teacher notes.
- Content skill tags and question difficulty, when reliable.

Do not run an audit until a configurable evidence threshold is met. Build Week can seed a synthetic history; the pilot default should require at least 2 sessions and 10 scorable responses.

Audit output uses a structured schema:

```ts
interface AuditRecommendation {
  action: 'keep' | 'add' | 'adjust' | 'remove' | 'observe';
  supportKey: SupportKey;
  proposedSettings?: Record<string, string | number | boolean>;
  evidence: Array<{ metric: string; observation: string }>;
  alternativeExplanations: string[];
  confidence: 'low' | 'medium' | 'high';
  reviewAfterSessions: number;
}
```

Acceptance criteria:

- The audit cites only evidence actually provided to it.
- It explicitly says when evidence is insufficient or mixed.
- It recommends no more than two changes at once and prefers an `observe` result over weak speculation.
- A teacher can inspect the underlying events, approve/reject/edit, add a note, and revert a change.
- Audit results never automatically alter the support plan or student-facing feedback.
- The system logs the prompt version, model configuration, evidence window, result, and teacher decision without logging secrets.

---

## 7. Initial support catalog

Use a typed catalog rather than unconstrained model-generated accommodations. Each support has a key, allowed settings, student-facing behavior, contraindications, and evidence signals.

| Support | Build Week behavior | Important constraint |
|---|---|---|
| Read aloud | Browser speech, replay, speed control | User gesture starts audio; do not require cloud TTS |
| Reading chunks | Reveal directions by teacher-approved sentence/step | Student can reveal all; preserve original wording |
| Focus view | Hide nonessential chrome for the current problem | Keep progress, help, and exit available |
| Hint ladder | Restate → first step → analogous example | Never reveal the answer in an early hint |
| Flexible response | Large choices or typing based on question | Do not convert response format when it changes the learning target |
| Calm pacing | Timer off or non-expiring visual timer | Never auto-advance on expiry |
| Break prompt | Optional short pause after configured effort | Student can skip; never frame as punishment |

Handwriting recognition, voice answers, AI mistake diagnosis, generated variants, and reward media remain post-Build Week experiments.

---

## 8. Technical architecture

### Application stack

- React + TypeScript + Vite.
- Locally bundled Tailwind; no runtime CDN dependencies.
- Firebase Hosting, Authentication, Firestore, Cloud Functions, App Check, and the Emulator Suite.
- OpenAI official server SDK inside Cloud Functions only.
- OpenAI Responses API for multimodal extraction and structured recommendation/audit output.
- Browser `speechSynthesis` for v1 read-aloud.
- Lightweight state: React state/context for UI and a small session store only if session complexity justifies it. Avoid adding global stores by default.

### Identity and persistence decision

Device-local IndexedDB profiles are rejected as the primary model because they cannot support teacher control, cross-device classrooms, or trustworthy audits. Firestore is the source of truth.

- Teachers authenticate with Firebase Google sign-in.
- Students use a class code plus a student-specific PIN/QR credential for the prototype; do not require a student email.
- Authorization is enforced with Firestore rules and callable-function checks.
- Browser storage may cache active work for resilience, but it is not an authority boundary.

Before a real pilot, verify whether the school's managed Google Workspace accounts and policies permit the selected sign-in flow.

### Core data model

```ts
Teacher { id, email, displayName, createdAt }
Classroom { id, teacherId, name, joinCodeHash, createdAt }
Student { id, classroomId, displayName, pinHash, status, createdAt }
StudentObservation { id, studentId, structuredAnswers, teacherSummary, createdBy, createdAt }
SupportPlan { id, studentId, version, supports, approvedBy, approvedAt, supersedesId }
Assignment { id, classroomId, title, status, source, questions, createdBy, publishedAt }
AssignmentTarget { assignmentId, studentId, supportPlanVersion }
Session { id, assignmentId, studentId, status, startedAt, completedAt }
AttemptEvent { id, sessionId, questionId, answer, outcome, elapsedMs, supportState, createdAt }
WorkArtifact { id, sessionId, questionId, storageRef, type, retentionExpiresAt }
AuditReport { id, studentId, evidenceWindow, promptVersion, recommendations, reviewedBy, reviewedAt }
```

Do not store raw onboarding chat when structured answers and a teacher-approved summary are sufficient. Do not store every canvas image by default; save it only when the teacher/student explicitly includes it as work evidence.

### AI boundary

Core server-side operations:

- `recommendSupports(observations)` → catalog-constrained starter recommendations.
- `generateHint(question, tier)` → optional; cache and require teacher approval when generated before publication.
- `auditSupports(evidenceWindow)` → evidence-cited recommendations.

Stretch operation:

- `extractAssignment(file)` → draft questions with source references and warnings.

Rules for every operation:

- Validate authentication, role, ownership, request size, and rate limits.
- Use JSON schema/structured outputs and validate again on the server.
- Keep model IDs and prompt versions in server configuration; pin a tested snapshot for the demo rather than scattering model strings through code.
- Use deterministic code for answer checking, permissions, thresholds, metrics, and plan application.
- Set Responses requests to avoid server-side storage when application state is unnecessary, and document actual retention behavior.
- Moderate open-ended teacher/student input when it can reach generation.
- Return a safe manual fallback on timeout, refusal, malformed output, or quota failure.
- Log latency, token usage, schema failures, and request IDs without logging sensitive content by default.

### Security baseline

- Replace both hard-coded passwords; never treat a client-side gate as security.
- Store the OpenAI key only as a server secret.
- Enable App Check before public deployment.
- Apply least-privilege Firestore and Storage rules with emulator tests.
- Rate-limit AI functions per teacher/class and enforce upload size/type limits.
- Add budget alerts and a server-side kill switch for AI features.
- Escape rendered content and scan uploaded file metadata; never render model HTML.
- Keep an immutable support-plan version/audit trail.

---

## 9. Build Week implementation plan

Each milestone ends in a deployable app. Commit each logical task separately and keep the tree clean.

The submission cut line is after Milestone 5. Milestones 0–5 are P0; Milestone 6 is P1 stretch. If the deadline gets tight, reduce visual polish and support count before cutting authorization, teacher approval, evidence grounding, or failure fallbacks.

### Milestone 0 — Baseline and guardrails

- Move app source under `src/` and split only the first components needed for the vertical slice.
- Install Tailwind locally; remove Tailwind/import-map CDNs.
- Add ESLint, formatting, Vitest, React Testing Library, and CI for typecheck/test/build.
- Add environment templates and confirm no secret enters `dist/`.
- Add an architecture decision record for cloud identity, synthetic demo data, and AI approval boundaries.

Exit criteria: current seed quiz still works; build and tests pass; no third-party runtime asset dependency; deployed preview works at 1366×768.

### Milestone 1 — Classroom identity and cloud data

- Firebase teacher sign-in, teacher route, and sign-out.
- Create classroom and synthetic student.
- Student join with class code + PIN/QR.
- Firestore collections, converters, rules, indexes, and emulator tests.
- Student/teacher route guards and event persistence.

Exit criteria: a teacher can create a student; only that teacher can view/edit the student; the student can see only their assigned content; direct unauthorized reads fail in emulator tests.

### Milestone 2 — Onboarding and approved support plans

- Structured teacher interview with skip/back/edit behavior.
- Fixed support catalog and manual configuration screen.
- Server-side `recommendSupports` with structured output.
- Recommendation review, preview-as-student, per-item approval, version history, and undo.

Exit criteria: demo onboarding returns catalog-valid recommendations with rationales; malformed/failed AI falls back to manual setup; nothing activates before approval.

### Milestone 3 — Assignment and resilient student runner

- Migrate seed questions to typed question/rubric models.
- Teacher assignment creation, preview, publish, and assign.
- Deterministic answer checking with unit tests.
- Student session resume, submit-based feedback, no infinite gate, approved read-aloud/focus/chunking/hints.
- Pointer Events canvas and local draft recovery.

Exit criteria: teacher assigns the seed activity; student completes it with refresh recovery; attempts and support events are recorded; keyboard/touch/stylus paths work; timer cannot auto-advance.

### Milestone 4 — Evidence review and audit

- Session review with attempts, timing, supports, and selected work artifacts.
- Deterministic summary metrics calculated on the server.
- `auditSupports` over a bounded evidence packet.
- Evidence citations, insufficient-evidence state, teacher decision, plan versioning, and revert.
- Seeded synthetic history for a reliable demo.

Exit criteria: the demo audit explains one conservative recommendation from visible evidence; teacher approval creates a new support-plan version; rejection changes nothing.

### Milestone 5 — Demo hardening

- End-to-end Playwright tests for the teacher and student happy paths.
- Accessibility pass: keyboard, screen reader labels, contrast, text scaling, reduced motion.
- Chromebook layout/performance test at 1366×768 and a narrow portrait viewport.
- Loading, offline, quota, refusal, and permission-denied states.
- Cost telemetry, rate limits, kill switch, seeded demo reset, and a rehearsed 3–5 minute narrative.
- Update README, architecture, API, and component docs to match the shipped app.

Exit criteria: a fresh environment can run the scripted demo twice without manual database repair, and all CI/emulator/E2E checks pass.

### Milestone 6 — Stretch: OpenAI assignment extraction

- Server-side upload validation and `extractAssignment` using the Responses API.
- Strict schema, source-page references, validation warnings, and teacher editing.
- Prompt/eval fixtures covering clean worksheets, tables, ambiguous answers, rotated photos, and unsupported content.

Exit criteria: a teacher can upload, review, correct, publish, and assign a worksheet; invalid drafts cannot publish; AI errors do not damage an existing assignment.

---

## 10. Post-Build Week roadmap

### Pilot hardening

- School privacy/security review, consent and notice language, data-processing agreements, and retention/deletion policy.
- Confirm FERPA/COPPA and applicable state/local requirements with the school and qualified counsel.
- Managed Chromebook and content-filter testing on the real school network.
- Teacher account recovery, roster import, audit exports, incident response, backups, and support process.
- Offline queue conflict handling and multi-device session protection.
- Usability sessions with teachers and students, including students who use assistive technology.

### Learning quality

- Move worksheet image/PDF extraction here if Milestone 6 misses the submission cut.
- Skill/concept taxonomy reviewed by educators.
- Rubric-aware short-response review with teacher confirmation.
- Similar-problem generation with solver/eval validation.
- In-session retry scheduling and later spaced practice based on skills, not exact-question IDs.
- Support-effect experiments that change one variable at a time.
- Teacher dashboard trends using personal baselines and clear uncertainty.

### Additional access supports

- Voice input with managed-device permission fallback.
- Handwriting answer capture with explicit student confirmation.
- Locally bundled Lexend/OpenDyslexic options after testing with actual users.
- Visual pacing, break routines, and alternative response formats.
- Optional high-quality OpenAI speech with clear AI-voice disclosure.

### Later integrations

- Google Classroom/LMS assignment links.
- District roster/SSO integrations.
- Parent/guardian summaries.
- Multi-school administration and configurable organization policies.

---

## 11. Evaluation plan

AI quality must be measured with repeatable fixtures before model or prompt changes ship.

### Assignment extraction eval

- Exact question count and ordering.
- Numeric/text answer correctness.
- Table and source-page fidelity.
- Rate of publish-blocking warnings.
- Hallucinated or omitted content.

### Onboarding recommendation eval

- Catalog validity and schema validity.
- Evidence-grounded rationale.
- No diagnosis or invented observation.
- Appropriate caution for timer/anxiety and response-mode conflicts.
- Preference for a small plan rather than enabling every support.

### Audit eval

- Every cited metric exists in the evidence packet.
- Correct insufficient-evidence behavior.
- No peer comparison, diagnosis, or high-stakes decision.
- Conservative number of proposed changes.
- Same fixture remains stable across prompt/model updates or differences are reviewed.

Keep a small educator-reviewed golden set in the repo without real student data. Run it in CI with mocked model responses and manually before changing the pinned model/prompt; do not make live API calls a normal unit-test dependency.

---

## 12. Real-student pilot readiness gate

Do not enter real student data until all items below have an accountable owner and approval:

- School administrator identifies the age range, classroom context, and legal basis/consent process.
- Data inventory identifies every field sent to Firebase and OpenAI, its purpose, retention, deletion, and who can access it.
- School/counsel reviews FERPA, COPPA, state student-privacy rules, vendor terms, and required notices or agreements.
- Teacher and student disclosures explain AI use in age-appropriate language.
- Teachers can correct, export, and delete data; support-plan decisions are auditable and reversible.
- OpenAI data controls and retention are configured and documented for the chosen endpoints.
- Threat model, rules tests, App Check, rate limits, budget alerts, backups, and incident-response contacts are complete.
- Accessibility testing includes representative users and assistive technology.
- The school confirms the app works on its managed Chromebooks and network.

---

## 13. Blocking product decisions

Answer these before implementation moves past Milestone 0:

1. What is the Build Week submission deadline and required demo format?
2. What student age/grade range and first subject should the demo target?
3. Will the demo use only synthetic students? This plan assumes yes.
4. Can teachers use Google sign-in, and can students use class code + PIN/QR on managed Chromebooks?
5. Do students keep one Chromebook or rotate devices?
6. Is Firebase Blaze approved, and what monthly cost ceiling/alert should be set?
7. Which 5–7 supports do the school's teachers consider most valuable and least disruptive?
8. Who at the school will review the onboarding questions, audit language, and pilot-readiness gate?

---

## 14. Key product decisions made by this revision

- Firestore replaces device-local profiles as the source of truth.
- Teacher ownership and student authorization are Phase 1 concerns, not later extensions.
- The onboarding conversation recommends only from an explicit support catalog.
- All support changes require teacher approval and create a reversible version.
- The audit uses a student's own history, has a minimum evidence threshold, and can return “observe.”
- Exact-question spaced repetition waits until a skill taxonomy exists.
- Timers never auto-advance.
- AI worksheet extraction is always a teacher-reviewed draft.
- Deterministic code—not AI—owns permissions, metrics, answer checks, thresholds, and applying plan changes.
- Build Week prioritizes one end-to-end teacher/student/evidence loop over a broad feature list.

## 15. Reference constraints

- Follow current OpenAI Usage Policies, including human review for high-impact education decisions.
- Treat API input retention and application-state behavior as an explicit design decision; do not assume API data is never retained.
- Use the OpenAI Moderation endpoint where open-ended content can reach generation, plus product-specific safeguards for minors.
- Keep the OpenAI integration server-side and use the official SDK, Responses API, and structured outputs.
