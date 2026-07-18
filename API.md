# Callable API

Quiz Master uses Firebase callable Functions in `us-central1`. Client services call them with Firebase Authentication and limited-use App Check tokens outside the emulator. Runtime schemas in `packages/domain` and `functions/src/**/**Core.ts` are authoritative; this document is a route map, not a duplicate schema definition.

## Common behavior

- Teacher endpoints require `role=teacher`, an active teacher record, and resource ownership.
- Student endpoints require `role=student`, matching Firebase UID/student ID, classroom ID, and current `authVersion`.
- App Check is enforced in production.
- Unknown fields and out-of-bounds arrays/strings are rejected.
- Teacher lifecycle helpers add `claimsRefreshRequired` to responses.
- Client-facing errors are stable and do not expose stored data, provider bodies, or secrets.

Typical error codes are `unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `failed-precondition`, `already-exists`, `resource-exhausted`, `unavailable`, and `internal`.

## Authentication and classroom lifecycle

| Callable | Caller | Input | Result |
|---|---|---|---|
| `bootstrapTeacher` | signed-in teacher candidate | `{}` | canonical teacher and refreshed claims flag |
| `createClassroom` | teacher | `{ name }` | classroom plus display-once class code |
| `archiveClassroom` | owner teacher | `{ classroomId }` | archived classroom |
| `rotateClassCode` | owner teacher | `{ classroomId }` | display-once replacement code |
| `createStudent` | owner teacher | `{ classroomId, displayName, studentHandle }` | safe student plus display-once PIN |
| `disableStudent` | owner teacher | `{ classroomId, studentId }` | disabled safe student; sessions are revoked |
| `resetStudentPin` | owner teacher | `{ classroomId, studentId }` | replacement PIN and incremented auth version |
| `exchangeStudentCredentials` | App Check client | `{ classCode, studentHandle, pin }` | scoped Firebase custom token |

PIN comparison uses `scrypt`, a per-student salt, and `STUDENT_PIN_PEPPER`. Exchange errors intentionally have a constant public shape and are throttled.

## Student profiles and support plans

| Callable | Input | Result |
|---|---|---|
| `saveStudentProfile` | `{ classroomId, studentId, observations, teacherSummary? }` | stored structured teacher profile |
| `getStudentPlanningData` | `{ classroomId, studentId }` | safe student, profile, active plan, and up to 50 versions |
| `recommendStudentSupports` | `{ classroomId, studentId }` | `{ proposalId, recommendationResult }` |
| `createSupportPlanVersion` | `{ classroomId, studentId, supports }` | new plan and active pointer |
| `revertSupportPlanVersion` | `{ classroomId, studentId, priorPlanId }` | a new version copied from the selected history entry |

`recommendStudentSupports` reads only the saved structured observations. It stores a teacher-only proposal but cannot activate it. Provider refusal, timeout, unavailable service, malformed output, or unsafe output returns a manual-setup fallback.

## Assignment lifecycle

| Callable | Input | Result |
|---|---|---|
| `createAssignmentDraft` | `{ classroomId, draft }` | draft assignment and revision metadata |
| `publishAssignment` | `{ classroomId, assignmentId, revisionId }` | immutable published assignment/revision |
| `assignPublishedAssignment` | `{ classroomId, assignmentId, studentIds[] }` | assignment and plan-pinned targets |

The draft supports `numeric`, `multipleChoice`, and `shortText` questions. The server materializes public questions separately from a server-only answer key. Published content cannot be edited in place.

## Student session lifecycle

These responses do not use the teacher envelope.

| Callable | Input | Result |
|---|---|---|
| `startOrResumeStudentSession` | `{ targetId }` | `{ session, supportPlan, resumed }` |
| `submitStudentAttempt` | `{ sessionId, questionId, idempotencyKey, submittedAnswer, activeSupports, clientOccurredAt, elapsedMs }` | canonical attempt, session, duplicate flag |
| `recordStudentSupportEvent` | `{ sessionId, questionId, idempotencyKey, supportKey, action, clientOccurredAt }` | canonical support event, session, duplicate flag |
| `advanceStudentSession` | `{ sessionId, currentQuestionId }` | next/completed session |
| `transitionStudentSession` | `{ sessionId, action }` | paused, resumed, or completed session |

Important invariants:

- Start/resume verifies the published assignment revision and pinned support plan.
- The returned plan contains student-safe support settings, not teacher notes.
- Attempt grading reads the protected answer key on the server.
- Short-text misses become `teacherReview` rather than forced incorrect.
- `advanceStudentSession` requires at least one canonical attempt for the current question, but it never requires correctness.
- Only supports enabled in the pinned plan may be recorded or attached to an attempt.
- A reused idempotency key must have the exact same request fingerprint.

## Evidence and audit

| Callable | Input | Result |
|---|---|---|
| `auditStudentEvidence` | `{ classroomId, studentId }` | audit ID, status, deterministic summary, structured result |
| `reviewStudentAudit` | `{ classroomId, studentId, auditId, decisions[], teacherNote? }` | immutable decision and optional new plan/pointer |

Audit status is `insufficientEvidence`, `completed`, or `failed`. `failed` means canonical evidence exists but automated suggestions were unavailable or unsafe; it is not a student failure.

Each teacher decision identifies the recommendation index and is `approve`, `reject`, or `observe`. Edited settings are accepted only for the stored `add`/`adjust` support key. The callable refuses stale active plans and duplicate final decisions.

## Demo-only endpoint

`seedSyntheticStudentEvidence({ classroomId, studentId, targetId })` creates an idempotent synthetic threshold history from a real published demo target. It requires:

- `FUNCTIONS_EMULATOR=true`;
- a Firebase project ID starting with `demo-`;
- teacher ownership, an active student, a valid target, published questions, and at least one enabled support.

It is present in the build but hard-disabled in production. It never overwrites a path and has no delete companion.

## AI provider configuration

The recommendation and audit adapters use the OpenAI Responses API structured-output parser, bounded output tokens, a 15-second timeout, no retry, and `store: false`.

```text
AI_PROVIDER=fake       default and forced in emulator
AI_PROVIDER=openai     live provider outside emulator
OPENAI_API_KEY         Firebase secret
OPENAI_RECOMMENDATION_MODEL  optional server override
OPENAI_AUDIT_MODEL           optional server override
```

Post-response validation is authoritative. A schema-valid model response can still be rejected for invented evidence, invalid catalog state, unsafe timer settings, diagnostic/causal language, peer comparison, or unsupported confidence/action combinations.
