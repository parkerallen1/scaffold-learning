# ADR 0001: Firebase identities for teachers and students

- Status: Accepted
- Date: 2026-07-17

## Context

Teachers need durable ownership across devices, while students should not need email accounts. The current client-side password gate provides neither identity nor authorization. A reset student PIN must also stop an already signed-in device from continuing to access student data.

## Decision

- Teachers sign in with Google through Firebase Authentication. A server callable bootstraps the teacher profile and `teacher` custom claim; Firestore classroom ownership remains the final authorization check.
- A teacher-created student receives a Firebase Auth UID, a random login identifier, and a salted, server-peppered PIN verifier. A QR code may contain the class and login identifiers, but never the PIN.
- An App-Check-protected server callable verifies the class/login identifiers and PIN, then returns a Firebase custom token carrying the `student` role, classroom ID, and `authVersion`.
- Firestore rules and student callables require the token UID, classroom ID, role, and `authVersion` to match the current student record.
- Resetting or disabling a student increments `authVersion`, updates claims, and revokes refresh tokens. This makes existing tokens fail application authorization immediately instead of waiting for normal token expiry.
- The server rate-limits failed student sign-in attempts. Class codes and App Check are abuse controls, not authentication by themselves.

## Consequences

- Teachers get conventional account recovery and cross-device access; students avoid managed email requirements.
- Student sign-in, claim refresh, PIN reset, and lockout behavior require emulator and staging tests.
- The first version assumes one classroom per student identity. Supporting students across multiple classes will require membership documents rather than one classroom claim.
- Every privileged callable must repeat role and ownership checks because Admin SDK operations bypass Firestore rules.

## Revisit triggers

- The school requires district SSO, Google Workspace domain restriction, roster sync, or student email accounts.
- A student must participate in multiple classrooms with one identity.
- The school requires faster centralized device/session revocation or stronger credentials than a PIN.
