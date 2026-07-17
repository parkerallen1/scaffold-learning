import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const forbiddenMarkers = [
  'GoogleGenAI',
  'GEMINI_API_KEY',
  'process.env.API_KEY',
  'aistudiocdn.com',
  'cdn.tailwindcss.com',
];

const roots = ['src', 'index.html', 'vite.config.ts', ...(existsSync('dist') ? ['dist'] : [])];
const violations = [];

const scan = async (entryPath) => {
  const entryStats = await stat(entryPath);
  if (entryStats.isFile()) {
    const contents = await readFile(entryPath, 'utf8');
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) {
        violations.push(`${entryPath}: ${marker}`);
      }
    }
    return;
  }

  const entries = await readdir(entryPath, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(entryPath, entry.name);
    await scan(childPath);
  }));
};

await Promise.all(roots.map(scan));

if (violations.length > 0) {
  console.error('Forbidden client boundary markers found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Client boundary check passed (${roots.join(', ')}).`);
}
