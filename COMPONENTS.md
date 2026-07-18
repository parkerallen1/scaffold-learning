# Client components

The React client is organized by route and feature. Firebase and domain operations live in service modules so components do not construct authorization rules or trust raw callable responses.

## Route tree

```text
App
├── HomePage                         /
├── DemoQuizPage                     /demo (legacy visual prototype)
├── StudentRoute                     /student
│   └── AuthProvider
│       └── StudentEntryPage
│           └── StudentWorkspace
├── TeacherHomeRoute                 /teacher
│   └── TeacherAccessBoundary
│       └── TeacherHomePage
│           └── ClassroomWorkspace
├── TeacherPlanningRoute             /teacher/planning?classroomId&studentId
│   └── TeacherStudentPlanningPage
│       ├── OnboardingInterview
│       ├── SupportPlanReview
│       └── AuditReviewPanel
├── TeacherAssignmentRoute           /teacher/assignments
│   └── TeacherAssignmentsPage
│       └── AssignmentAuthoringForm
└── TeacherPreviewRoute              /teacher/preview
```

Teacher routes are lazy-loaded and wrapped by `AuthProvider` plus `TeacherAccessBoundary`. The student route verifies the custom-token role before rendering assigned work.

## Identity and classroom components

### `AuthProvider`

Owns Firebase auth observation and exposes safe teacher/student users, loading/error/working state, teacher sign-in, student credential exchange, and sign-out. It rejects tokens with missing or inconsistent roles.

### `TeacherAccessBoundary`

Renders loading, sign-in, invalid-role, or protected teacher content. Production teacher access uses Google; emulator mode exposes a synthetic anonymous teacher path.

### `ClassroomWorkspace`

Lists only classrooms owned by the teacher, manages the selected roster, and calls server lifecycle operations. Class codes and PINs are passed immediately to `CredentialReveal` and are never stored in local storage.

### `CredentialReveal`

A modal acknowledgement boundary for display-once credentials. The accessibility hardening pass owns its dialog focus, Escape, and focus-return behavior. Closing the modal removes the raw secret from React state.

## Planning components

### `OnboardingInterview`

Presents nine teacher questions one at a time with skip, back, edit, and review behavior. It outputs strict structured observations and an optional teacher summary; it never produces or persists a raw chat transcript.

### `SupportPlanReview`

The approval boundary for onboarding recommendations and manual configuration. Every recommendation begins proposed. The teacher can approve/reject item by item, edit typed settings, add supports manually, and preview plain-language student behavior.

`SettingsEditor` is shared with audit review so both paths use the same catalog-valid controls.

### `TeacherStudentPlanningPage`

Coordinates profile load/save, recommendation generation, manual fallback, explicit plan creation, history, and confirmed revert. Disabled students remain read-only.

### `AuditReviewPanel`

Runs the server audit and shows canonical counts, evidence threshold, exact event citations, confidence, and alternative explanations. It requires an approve/reject/observe decision for every recommendation and confirmation before submitting a final review. It reloads planning data after a new audit-sourced plan version is created.

## Assignment components

### `AssignmentAuthoringForm`

Builds strict numeric, multiple-choice, and short-text drafts. It validates required answers, unique IDs, valid choice keys, answer bounds, and approved hints before calling its publish handler. The component contains teacher-only draft answers but never receives a persisted answer key.

### `TeacherAssignmentsPage`

Loads active classrooms/students, requires at least one active recipient, and runs create → publish → target after explicit confirmation. Published questions cannot be edited in place.

## Student work components

### `StudentWorkspace`

Lists the signed-in student’s targets, opens or resumes one canonical session, and renders one question at a time.

The question runner provides:

- numeric, multiple-choice, and short-text inputs;
- neutral correct/incorrect/teacher-review feedback;
- retry or review-later progression after a recorded attempt;
- pause/resume and confirmed early completion;
- approved read-aloud, reading chunks, focus view, and hint ladder;
- support-event logging and active-support attempt context;
- local typed-answer and idempotency-key recovery;
- the Pointer Events scratch canvas, kept local and not uploaded.

`studentWorkService` strictly parses every Firestore document and callable response. `studentDraftStorage` scopes records by student/session/question and clears them on advance, completion, or sign-out.

## Shared/legacy quiz components

`DemoQuizPage` and `features/quiz` preserve the original visual prototype for comparison and a known seed activity. `ScratchCanvas` is reused by the real student runner. The production classroom path does not use the prototype password/settings controls.

## Service boundary

| Service | Responsibility |
|---|---|
| `authService` | Firebase auth, role parsing, credential exchange |
| `classroomService` | teacher lifecycle callables and constrained roster reads |
| `planningService` | profiles, recommendation, plans, history, revert |
| `assignmentService` | assignment create/publish/target contract |
| `studentWorkService` | target/question reads and session callables |
| `auditService` | evidence audit and immutable teacher decision |
| `speech` | optional browser `speechSynthesis` read-aloud |

Services convert all errors to generic user-safe messages. Components should not display raw Firebase/OpenAI errors or log student answers, observations, PINs, class codes, or answer keys.

## Component rules

- Use semantic buttons/labels/fieldsets instead of clickable containers.
- Provide visible status and error regions without relying on color alone.
- Preserve a 44×44 CSS-pixel target for primary student controls.
- Keep focus visible and restore focus after modals.
- No automatic audio, submit, question advance, or expiring countdown behavior.
- Student supports come only from the session’s pinned plan.
- AI suggestions remain inactive until an authorized teacher action succeeds.
- Add a focused Testing Library test for each critical state transition.
