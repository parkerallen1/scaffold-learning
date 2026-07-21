import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const PUBLIC_ENV_PATH = '.env.local';
const PUBLIC_ENV_EXAMPLE_PATH = '.env.example';
const SECRET_ENV_PATH = 'functions/.secret.local';
const SECRET_ENV_EXAMPLE_PATH = 'functions/.secret.local.example';
const LOCAL_OPENAI_API_KEY = 'unused-in-deterministic-fake-emulator';
const LOCAL_PIN_PEPPER = 'scaffold-learning-local-demo-only-not-a-production-secret';

const created = [];
const updated = [];

if (!existsSync(PUBLIC_ENV_PATH)) {
  await writeFile(PUBLIC_ENV_PATH, await readFile(PUBLIC_ENV_EXAMPLE_PATH, 'utf8'), {
    encoding: 'utf8',
    mode: 0o600,
  });
  created.push(PUBLIC_ENV_PATH);
}

const secretExisted = existsSync(SECRET_ENV_PATH);
let secretContents = secretExisted
  ? await readFile(SECRET_ENV_PATH, 'utf8')
  : await readFile(SECRET_ENV_EXAMPLE_PATH, 'utf8');
const pepperPattern = /^STUDENT_PIN_PEPPER=.*$/m;
const configuredPepperPattern = /^STUDENT_PIN_PEPPER=.+$/m;
const openAiKeyPattern = /^OPENAI_API_KEY=.*$/m;
const configuredOpenAiKeyPattern = /^OPENAI_API_KEY=.+$/m;

if (!configuredOpenAiKeyPattern.test(secretContents)) {
  secretContents = openAiKeyPattern.test(secretContents)
    ? secretContents.replace(openAiKeyPattern, `OPENAI_API_KEY=${LOCAL_OPENAI_API_KEY}`)
    : `${secretContents.trimEnd()}\nOPENAI_API_KEY=${LOCAL_OPENAI_API_KEY}\n`;
  if (secretExisted) updated.push(SECRET_ENV_PATH);
}

if (!configuredPepperPattern.test(secretContents)) {
  secretContents = pepperPattern.test(secretContents)
    ? secretContents.replace(pepperPattern, `STUDENT_PIN_PEPPER=${LOCAL_PIN_PEPPER}`)
    : `${secretContents.trimEnd()}\nSTUDENT_PIN_PEPPER=${LOCAL_PIN_PEPPER}\n`;
  if (secretExisted) updated.push(SECRET_ENV_PATH);
}

if (!secretExisted || updated.includes(SECRET_ENV_PATH)) {
  await writeFile(SECRET_ENV_PATH, secretContents, { encoding: 'utf8', mode: 0o600 });
  if (!secretExisted) created.push(SECRET_ENV_PATH);
}

if (created.length === 0 && updated.length === 0) {
  console.log('Local demo environment is ready. Existing values were preserved.');
} else {
  const changedPaths = [...new Set([...created, ...updated])];
  console.log(`Local demo environment prepared: ${changedPaths.join(', ')}.`);
}
