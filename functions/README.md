# Firebase Functions

This workspace targets Node 22 and defaults to the deterministic `FakeAiProvider`. It does not depend on OpenAI or require a secret to build and run.

For future local secret-backed work, copy `.secret.local.example` to `.secret.local` and fill values locally. Firebase's Functions emulator reads `.secret.local`; the repository ignores `*.local`. Never put server secrets in the root `.env.local` or any `VITE_*` variable because Vite exposes those values to the browser bundle.

Run the Functions checks and build from the repository root:

```sh
npm run functions:check
npm run build --workspace functions
```

Start the local-only Firebase stack with `npm run emulators:start`. The default Firebase project alias is `demo-quiz-master`; production remains available only through the explicit `production` alias and must not be used by local scripts.

The Firestore emulator requires a local Java runtime. If `npm run firebase:validate` reports that `java -version` failed, install a Firebase-supported JDK before running emulator and rules tests. Frontend and Functions builds do not require Java.
