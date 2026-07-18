import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const forbiddenMarkers = [
  '@google/genai',
  '@google/generative-ai',
  'GoogleGenAI',
  'GEMINI_API_KEY',
  'generativelanguage.googleapis.com',
];

const roots = [
  'src',
  'functions/src',
  'package.json',
  'functions/package.json',
  'package-lock.json',
  'vite.config.ts',
].filter(existsSync);
const violations = [];

const scan = async (entryPath) => {
  const entryStats = await stat(entryPath);
  if (entryStats.isFile()) {
    const contents = await readFile(entryPath, 'utf8');
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) violations.push(`${entryPath}: ${marker}`);
    }
    return;
  }

  const entries = await readdir(entryPath, { withFileTypes: true });
  await Promise.all(entries.map((entry) => scan(path.join(entryPath, entry.name))));
};

await Promise.all(roots.map(scan));

if (violations.length > 0) {
  console.error('Retired Gemini provider markers found in an active runtime boundary:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`OpenAI provider boundary check passed (${roots.join(', ')}).`);
}
