import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const forbiddenMarkers = [
  'GoogleGenAI',
  'GEMINI_API_KEY',
  'process.env.API_KEY',
];

// TODO(M0-04): Add aistudiocdn.com and cdn.tailwindcss.com after runtime CDNs are removed.
const roots = ['src', ...(existsSync('dist') ? ['dist'] : [])];
const violations = [];

const scan = async (entryPath) => {
  const entries = await readdir(entryPath, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(entryPath, entry.name);

    if (entry.isDirectory()) {
      await scan(childPath);
      return;
    }

    const contents = await readFile(childPath, 'utf8');
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) {
        violations.push(`${childPath}: ${marker}`);
      }
    }
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
