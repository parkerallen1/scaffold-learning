# ADR 0005: Limit offline support to active work

- Status: Accepted
- Date: 2026-07-17

## Context

Managed Chromebooks may briefly lose connectivity. A refresh or short outage must not erase a student's current answer or scratch work, but broad offline replication would retain sensitive classroom data on shared devices and create authorization and conflict risks.

## Decision

- Firestore remains the authority. Local persistence protects only the currently opened, already-authorized assignment content, answer draft, scratchpad state, and a bounded queue of student events.
- Each queued submission or event has a client-generated idempotency key. The server validates authorization and session state, assigns canonical timestamps and outcomes, and safely ignores duplicates.
- An offline submission is shown as saved locally and pending; correctness and progress are not finalized until the server acknowledges it because answer keys remain server-only.
- Offline mode cannot start a new session, publish or assign work, change a support plan, run AI, generate an audit, or retrieve uncached classroom data.
- Local active-work data is scoped by Firebase UID and session, expires after a short documented period, and is cleared on completion, sign-out, student switch, reset, or authorization failure. Teacher notes, rosters, answer keys, credentials, and audit data are never intentionally cached for offline use.
- Queue size and artifact size are bounded. Sync conflicts preserve the server record and present a recoverable status rather than silently overwriting work.

## Consequences

- Brief outages do not destroy active work, while data retained on a shared Chromebook stays limited.
- Students cannot receive correctness feedback or begin uncached work while offline.
- The application needs explicit pending/synced/error states and tests for refresh, reconnect, duplicate delivery, account switching, and expired access.
- Full-day offline classroom operation is out of scope for Build Week.

## Revisit triggers

- School network testing shows outages longer than the bounded active-work design can support.
- The school requires full offline assignments, shared-device kiosk behavior, or cross-device offline resume.
- Browser storage policy, managed-Chromebook settings, or privacy requirements change.
