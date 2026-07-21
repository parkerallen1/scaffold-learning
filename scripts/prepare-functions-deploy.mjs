import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsDirectory = join(repositoryRoot, 'functions');
const domainDirectory = join(repositoryRoot, 'packages', 'domain');
const deployDirectory = join(repositoryRoot, 'functions-deploy');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const functionsPackage = readJson(join(functionsDirectory, 'package.json'));
const domainPackage = readJson(join(domainDirectory, 'package.json'));

rmSync(deployDirectory, { recursive: true, force: true });
mkdirSync(join(deployDirectory, 'domain'), { recursive: true });
writeFileSync(join(deployDirectory, '.gitkeep'), '', 'utf8');

cpSync(join(functionsDirectory, 'lib'), join(deployDirectory, 'lib'), { recursive: true });
cpSync(join(domainDirectory, 'dist'), join(deployDirectory, 'domain', 'dist'), {
  recursive: true,
});

writeJson(join(deployDirectory, 'package.json'), {
  name: functionsPackage.name,
  private: true,
  version: functionsPackage.version,
  type: functionsPackage.type,
  main: functionsPackage.main,
  engines: functionsPackage.engines,
  scripts: { 'gcp-build': '' },
  dependencies: {
    ...functionsPackage.dependencies,
    '@scaffold-learning/domain': 'file:./domain',
  },
});

writeJson(join(deployDirectory, 'domain', 'package.json'), {
  name: domainPackage.name,
  private: true,
  version: domainPackage.version,
  type: domainPackage.type,
  main: domainPackage.main,
  exports: domainPackage.exports,
  dependencies: domainPackage.dependencies,
});

for (const fileName of ['.env.local', '.env.quiz-master-pg', '.secret.local']) {
  const source = join(functionsDirectory, fileName);
  if (existsSync(source)) {
    cpSync(source, join(deployDirectory, fileName));
  }
}

console.log('Prepared self-contained Firebase Functions source in functions-deploy.');
