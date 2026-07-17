# ADR 0004: Physically isolate student-readable and sensitive data

- Status: Accepted
- Date: 2026-07-17

## Context

Firestore rules authorize whole document reads; they cannot hide selected fields. Storing answer keys beside question prompts, or teacher observations beside active student settings, would expose sensitive data whenever the student reads that document.

## Decision

- Student-readable documents contain only the minimum fields required for the student experience.
- Assignment prompts, choices, and approved hints are stored separately from answer keys and grading rubrics. Answer-key documents deny all client access and are read only by server functions.
- The active student support configuration contains support keys and student-facing settings only. Teacher observations, onboarding answers, recommendation rationales, cautions, audit reports, and plan history remain in teacher-only documents.
- Canonical attempt outcomes and plan transitions are server writes. Students may write only narrowly validated active-work drafts.
- Firestore rules default to deny and grant access by role, classroom ownership, assignment target, student UID, and current authentication version. Rules and callable tests include cross-teacher and cross-student denial cases.
- Where a teacher workflow needs both safe and sensitive records updated, a callable transaction owns the denormalized write.

## Consequences

- A mistaken student read rule cannot reveal an answer key or teacher note stored in the same document.
- Data is denormalized, so publishing and plan approval require transactional synchronization and repair tests.
- Teacher and student queries use different collections or references rather than one universal document model.
- Server functions must perform explicit authorization because Admin SDK access bypasses rules.

## Revisit triggers

- A backend other than Firestore provides field-level authorization with equivalent testability.
- New content types introduce additional secrets, rubrics, annotations, or staff-only records.
- Transaction limits, document counts, or read costs make the current split impractical at measured scale.
