# Emulator end-to-end tests

These Playwright tests cover the smallest high-confidence browser layer in the test pyramid:

- public route rendering and the unauthenticated teacher boundary;
- the synthetic Build Week loop from an emulator teacher through student completion and back to the teacher’s evidence counts.

They always build the client and Functions, serve the client preview on port 4173, and start Firebase Auth, Firestore, and Functions against the reserved `demo-scaffold-learning` project. Firebase Hosting is not started, so the harness cannot collide with a production hosting target. The test server supplies a clearly non-secret local PIN pepper and leaves the deterministic fake AI provider enabled. The stateful happy-path test clears only that local emulator project before it runs. Do not change the project ID or use real student data.

## Run

Prerequisites are Node 22, Java 21 for the Firebase Emulator Suite, and system Google Chrome. Browser binaries are intentionally not downloaded by npm install.

```sh
npm run e2e
```

For Playwright’s interactive runner:

```sh
npm run e2e:ui
```

If Java is unavailable, the route smoke test can still run against an already-built external server. Start `npm run e2e:preview` in one terminal, then run this in another:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=true npx playwright test tests/e2e/routes.spec.ts
```

That command checks only rendering and the unauthenticated access boundary; it does not validate emulator callables or the cross-role happy path.

Tests use role and label locators, avoid fixed sleeps, run with one worker for deterministic emulator state, and retain traces and screenshots when a test fails. Reports are written to ignored `playwright-report/` and `test-results/` directories.

## Coverage boundary

The happy path verifies one completed session, its correct submitted response, and its approved support-use event in the read-only teacher evidence view. Automated audit recommendations require more sessions and responses; deterministic aggregation, recommendation validation, and approval transitions remain covered by the faster unit and Functions test layers.
