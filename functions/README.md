# Firebase Functions

This workspace targets Node 22 and defaults to deterministic providers. It does not require an
OpenAI secret to build, test, or run the standard demo.

For future local secret-backed work, copy `.secret.local.example` to `.secret.local` and fill values locally. Firebase's Functions emulator reads `.secret.local`; the repository ignores `*.local`. Never put server secrets in the root `.env.local` or any `VITE_*` variable because Vite exposes those values to the browser bundle.

Run the Functions checks and build from the repository root:

```sh
npm run functions:check
npm run build --workspace functions
```

Start the local-only Firebase stack with `npm run emulators:start`. The default Firebase project alias is `demo-scaffold-learning`; production remains available only through the explicit `production` alias and must not be used by local scripts.

To exercise the real OpenAI integrations in the emulator, put a valid key in
`functions/.secret.local`, then set these ignored values in `functions/.env.local`:

```dotenv
AI_PROVIDER=openai
AI_FEATURES_ENABLED=true
AI_EMULATOR_LIVE_OPENAI=true
```

Restart the Functions emulator after changing these values. This opt-in enables live support
recommendations, IEP analysis, assignment drafting, evidence audits, and TTS. Usage is billed to the
OpenAI project associated with the key. Set `AI_EMULATOR_LIVE_OPENAI=false` to return to deterministic
responses.

The Firestore emulator requires a local Java runtime. If `npm run firebase:validate` reports that `java -version` failed, install a Firebase-supported JDK before running emulator and rules tests. Frontend and Functions builds do not require Java.
