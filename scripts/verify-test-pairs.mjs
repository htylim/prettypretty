import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, 'src/renderer');
const TEST_DIR = join(ROOT, 'tests/unit/renderer');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_FILES = new Set(['main.tsx', 'types/window-api.d.ts']);

const collectFiles = (directory) => {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

const sourceFiles = collectFiles(SOURCE_DIR).filter((fullPath) => {
  const relPath = relative(SOURCE_DIR, fullPath);
  const extension = extname(fullPath);

  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  if (relPath.endsWith('.d.ts')) {
    return false;
  }

  if (EXCLUDED_FILES.has(relPath)) {
    return false;
  }

  return true;
});

const missingTests = [];

for (const sourceFile of sourceFiles) {
  const relPath = relative(SOURCE_DIR, sourceFile);
  const noExtension = relPath.replace(/\.(ts|tsx)$/u, '');
  const extension = extname(sourceFile) === '.tsx' ? '.tsx' : '.ts';
  const expectedTestFile = join(TEST_DIR, `${noExtension}.test${extension}`);

  if (!existsSync(expectedTestFile)) {
    missingTests.push(relative(ROOT, expectedTestFile));
  }
}

if (missingTests.length > 0) {
  console.error('Missing unit test files for renderer modules:');
  for (const file of missingTests) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('All tracked renderer modules have unit test files.');
