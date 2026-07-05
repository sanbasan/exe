import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const TARGET_EXTENSIONS = new Set(['.mjs', '.ts', '.tsx']);
const ROOT_DIR = process.cwd();
const IGNORED_DIR_NAMES = new Set([
  '.next',
  'coverage',
  'dist',
  'node_modules',
]);
const DISABLE_PATTERN =
  /^\s*(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?!.*-- .+)/u;

const walk = async (directoryPath: string): Promise<readonly string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return IGNORED_DIR_NAMES.has(entry.name) ? [] : walk(entryPath);
      }

      if (!entry.isFile() || !TARGET_EXTENSIONS.has(path.extname(entry.name))) {
        return [];
      }

      return [entryPath];
    })
  );

  return nestedFiles.flat();
};

const findViolations = async (): Promise<readonly string[]> => {
  const files = await walk(ROOT_DIR);
  const violations = await Promise.all(
    files.map(async (filePath): Promise<readonly string[]> => {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n');

      return lines.flatMap((line, index) =>
        DISABLE_PATTERN.test(line)
          ? [`${path.relative(ROOT_DIR, filePath)}:${String(index + 1)}`]
          : []
      );
    })
  );

  return violations.flat();
};

const main = async (): Promise<void> => {
  const violations = await findViolations();

  if (violations.length > 0) {
    throw new Error(
      `eslint-disable requires a reason after "--": ${violations.join(', ')}`
    );
  }
};

void main();
