import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

interface Violation {
  readonly filePath: string;
  readonly lineNumber: number;
  readonly name: string;
}

const ROOT_DIR = path.resolve(process.cwd(), '..');
const TARGET_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.json',
  '.md',
  '.mjs',
  '.plist',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const TARGET_FILE_NAMES = new Set(['Makefile']);
const IGNORED_DIR_NAMES = new Set([
  '.firebase',
  '.git',
  '.next',
  '.security-artifacts',
  '.turbo',
  '.vercel',
  '.xcodeproj',
  'DerivedData',
  'coverage',
  'dist',
  'node_modules',
]);
const SECRET_NAME_PATTERN = /(?:SECRET|TOKEN|API_KEY|AUTH_KEY|PRIVATE_KEY)/u;
const ENV_SECRET_ASSIGNMENT_PATTERN =
  /^\s*([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|AUTH_KEY|PRIVATE_KEY))\s*=\s*(.+?)\s*$/u;
const YAML_VARIABLE_PATTERN = /^\s*-\s*variable:\s*['"]?([A-Z0-9_]+)['"]?\s*$/u;
const YAML_VALUE_PATTERN = /^\s*value:\s*['"]?(.+?)['"]?\s*$/u;
const YAML_SECRET_PATTERN = /^\s*secret:\s*['"]?([A-Z0-9_@.-]+)['"]?\s*$/u;
const SECRET_VALUE_PATTERNS: readonly SecretPattern[] = [
  {
    name: 'private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  },
  {
    name: 'SendGrid API key',
    pattern: /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/u,
  },
  {
    name: 'Slack token',
    pattern: /xox[baprs]-[A-Za-z0-9-]+/u,
  },
  {
    name: 'service account private key',
    pattern: /"private_key"\s*:\s*".*PRIVATE KEY/u,
  },
];

const shouldScanFile = (fileName: string): boolean =>
  TARGET_FILE_NAMES.has(fileName) ||
  TARGET_EXTENSIONS.has(path.extname(fileName));

const walk = async (directoryPath: string): Promise<readonly string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return IGNORED_DIR_NAMES.has(entry.name) ? [] : walk(entryPath);
      }

      if (!entry.isFile() || !shouldScanFile(entry.name)) {
        return [];
      }

      return [entryPath];
    })
  );

  return nestedFiles.flat();
};

const isPlaceholderValue = (value: string): boolean => {
  const normalized = value.trim().replace(/^['"]|['"]$/gu, '');

  return (
    normalized.length === 0 ||
    normalized === '<redacted>' ||
    normalized === '<secret>' ||
    normalized.startsWith('$') ||
    normalized.startsWith('\\$') ||
    normalized === 'TODO' ||
    normalized === 'TODO_SECRET' ||
    normalized === 'changeme'
  );
};

const getMatchGroup = ({
  match,
  index,
}: {
  readonly index: number;
  readonly match: RegExpExecArray;
}): string | null => match.at(index) ?? null;

const findPatternViolations = ({
  filePath,
  line,
  lineNumber,
}: {
  readonly filePath: string;
  readonly line: string;
  readonly lineNumber: number;
}): readonly Violation[] =>
  SECRET_VALUE_PATTERNS.flatMap((secretPattern) =>
    secretPattern.pattern.test(line)
      ? [{ filePath, lineNumber, name: secretPattern.name }]
      : []
  );

const findEnvAssignmentViolation = ({
  filePath,
  line,
  lineNumber,
}: {
  readonly filePath: string;
  readonly line: string;
  readonly lineNumber: number;
}): readonly Violation[] => {
  const match = ENV_SECRET_ASSIGNMENT_PATTERN.exec(line);

  if (match === null) {
    return [];
  }

  const value = getMatchGroup({ index: 2, match });

  if (value === null || isPlaceholderValue(value)) {
    return [];
  }

  return [{ filePath, lineNumber, name: 'non-placeholder secret assignment' }];
};

const findYamlSecretValueViolations = ({
  filePath,
  lines,
}: {
  readonly filePath: string;
  readonly lines: readonly string[];
}): readonly Violation[] =>
  lines.flatMap((line, index): readonly Violation[] => {
    const match = YAML_VARIABLE_PATTERN.exec(line);
    const variableName =
      match === null ? null : getMatchGroup({ index: 1, match });

    if (variableName === null || !SECRET_NAME_PATTERN.test(variableName)) {
      return [];
    }

    const nextLines = lines.slice(index + 1, index + 4);
    const usesSecretReference = nextLines.some((nextLine) =>
      YAML_SECRET_PATTERN.test(nextLine)
    );
    const valueLine = nextLines.find((nextLine) =>
      YAML_VALUE_PATTERN.test(nextLine)
    );

    if (usesSecretReference || valueLine === undefined) {
      return [];
    }

    return [
      {
        filePath,
        lineNumber: index + 1,
        name: 'YAML secret-like variable uses value instead of secret',
      },
    ];
  });

const findFileViolations = async (
  filePath: string
): Promise<readonly Violation[]> => {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const lineViolations = lines.flatMap((line, index) => [
    ...findPatternViolations({
      filePath,
      line,
      lineNumber: index + 1,
    }),
    ...findEnvAssignmentViolation({
      filePath,
      line,
      lineNumber: index + 1,
    }),
  ]);

  return [
    ...lineViolations,
    ...findYamlSecretValueViolations({ filePath, lines }),
  ];
};

const formatViolation = (violation: Violation): string =>
  `${path.relative(ROOT_DIR, violation.filePath)}:${String(
    violation.lineNumber
  )} ${violation.name}`;

const main = async (): Promise<void> => {
  const files = await walk(ROOT_DIR);
  const violations = (await Promise.all(files.map(findFileViolations))).flat();

  if (violations.length > 0) {
    throw new Error(
      `Potential secrets found:\n${violations.map(formatViolation).join('\n')}`
    );
  }
};

void main();
