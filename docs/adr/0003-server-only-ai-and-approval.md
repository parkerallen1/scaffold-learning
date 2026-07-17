# ADR 0003: Server-only AI with deterministic fallback and approval

- Status: Accepted
- Date: 2026-07-17

## Context

AI is useful for drafting support recommendations, audits, hints, and worksheet extraction, but model credentials and unconstrained output cannot be trusted in the browser. The core student workflow must remain usable during model failures and the model must not make educational decisions autonomously.

## Decision

- All model calls run behind Firebase Functions using a Secret Manager-bound API key. No model SDK, credential, model selection, or privileged prompt is shipped to the browser.
- A single typed AI interface has two implementations: a live OpenAI provider and a deterministic fake provider backed by checked-in synthetic fixtures. Both return the same validated schemas.
- Emulator and default demo flows use the fake provider. Live calls require explicit server configuration and have time, input, output, rate, and budget limits.
- The server fetches authoritative inputs, requests structured output, validates it again against the support catalog and supplied evidence, and logs metadata without raw student notes.
- AI output is always a draft. A teacher must approve support recommendations, audit changes, generated hints, and extracted assignment content before they affect a student. Deterministic server code performs publication and support-plan version changes.
- AI is not used for authentication, authorization, answer checking, evidence thresholds, metrics, or the live submit path. Failure returns a manual or deterministic fallback.

## Consequences

- Secrets remain server-side and the demo is repeatable without network access or API quota.
- Provider adapters, schemas, prompt versions, fixtures, and educator-reviewed evals add implementation work.
- A schema-valid model response can still be educationally poor; teacher review and golden-set evaluation remain required.
- Live and fake providers must be tested for contract parity.

## Revisit triggers

- A new AI feature cannot be expressed as a bounded, reviewable draft.
- Evaluation shows the selected model or prompt no longer meets the approved quality and safety thresholds.
- School/vendor data-control requirements change or a new provider is considered.
- A validated feature needs low-latency student interaction and has a safe non-AI failure path.
