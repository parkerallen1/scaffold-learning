# ADR 0002: Synthetic-only Build Week data

- Status: Accepted
- Date: 2026-07-17

## Context

The Build Week demo needs realistic onboarding, work history, and audit evidence, but the product has not completed the privacy, security, accessibility, and school-approval work required for real student information.

## Decision

- Build Week environments, fixtures, screenshots, recordings, and seeded histories use clearly fictional students, teachers, assignments, notes, and work samples.
- Seed and reset tooling may operate only on the emulator or an explicitly identified synthetic-demo namespace.
- Product copy and contributor documentation state that real student data is not permitted during the demo phase.
- Real student use remains blocked until the readiness gate in `PLAN.md` has named owners and recorded approval for data inventory and retention, school/legal review, notices and consent, correction/export/deletion, vendor data controls, threat modeling, accessibility, and managed-device/network testing.
- Passing the gate authorizes a separate pilot environment and migration decision; demo data is not converted into pilot data.

## Consequences

- The team can demonstrate the full evidence loop without exposing student information or prematurely implying pilot readiness.
- Synthetic histories may miss classroom behaviors, so demo success is not evidence of learning effectiveness.
- Any manual entry of real student details is a process violation even if the application technically accepts the fields.

## Revisit triggers

- Every item in the real-student readiness gate has an accountable owner and written approval.
- The school changes the target age, classroom context, consent basis, or required vendor agreements.
- The product begins a supervised usability study or pilot involving identifiable students.
