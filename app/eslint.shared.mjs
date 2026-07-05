import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import functional from 'eslint-plugin-functional';
import importAccess from 'eslint-plugin-import-access/flat-config';
import importX from 'eslint-plugin-import-x';
import perfectionist from 'eslint-plugin-perfectionist';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultIgnores = [
  '.next/**',
  'coverage/**',
  'dist/**',
  'eslint.config.mjs',
  'node_modules/**',
];

const layerImportMessage =
  'Layer boundary violation. Import through a public workspace alias or inject the dependency at the composition boundary.';

const packageBoundaryPatterns = [
  {
    group: ['@exe/*/src/**', '@exe/*/dist/**'],
    message: 'Do not import package internals. Use a declared @exe/* export.',
  },
  {
    group: ['../packages/**', '../../packages/**', '../../../packages/**'],
    message:
      'Do not reach into sibling packages by relative path. Use a declared @exe/* export.',
  },
];

const nodeGlobals = {
  Blob: 'readonly',
  Buffer: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
};

const browserGlobals = {
  HTMLDivElement: 'readonly',
  HTMLElement: 'readonly',
  ResizeObserver: 'readonly',
  ResizeObserverEntry: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  confirm: 'readonly',
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  navigator: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

const reactGlobals = {
  React: 'readonly',
};

const toolingGlobals = {
  ...browserGlobals,
  ...nodeGlobals,
  ...reactGlobals,
  __dirname: 'readonly',
  module: 'readonly',
  require: 'readonly',
};

const toolingSharedRules = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unused-imports/no-unused-imports': 'error',
};

const toolingTypeScriptRules = {
  ...typescriptPlugin.configs['recommended-type-checked'].rules,
  ...typescriptPlugin.configs['strict-type-checked'].rules,
  ...toolingSharedRules,
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    { assertionStyle: 'never' },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
  'local/no-undefined-argument-types': 'error',
  'no-process-env': 'error',
  'security/detect-eval-with-expression': 'error',
  'security/detect-object-injection': 'error',
};

const typeScriptRules = {
  ...typescriptPlugin.configs['recommended-type-checked'].rules,
  ...typescriptPlugin.configs['strict-type-checked'].rules,
  ...typescriptPlugin.configs['stylistic-type-checked'].rules,
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    { assertionStyle: 'never' },
  ],
  '@typescript-eslint/explicit-function-return-type': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/no-base-to-string': 'error',
  '@typescript-eslint/no-confusing-void-expression': [
    'error',
    {
      ignoreArrowShorthand: true,
      ignoreVoidOperator: true,
    },
  ],
  '@typescript-eslint/no-deprecated': 'error',
  '@typescript-eslint/no-dynamic-delete': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/prefer-readonly': 'error',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/strict-boolean-expressions': [
    'error',
    {
      allowNullableObject: false,
      allowNumber: false,
      allowString: false,
    },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
  'require-await': 'error',
};

const customRules = {
  'arrow-body-style': ['error', 'as-needed'],
  complexity: ['error', 15],
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  'func-style': ['error', 'expression'],
  'functional/functional-parameters': 'off',
  'functional/no-conditional-statements': 'off',
  'functional/no-expression-statements': 'off',
  'functional/no-return-void': 'off',
  'functional/no-throw-statements': 'off',
  'functional/prefer-immutable-types': 'off',
  'import-access/jsdoc': ['error'],
  'import-x/no-cycle': ['error', { ignoreExternal: true }],
  'import-x/no-mutable-exports': 'error',
  'local/no-undefined-argument-types': 'error',
  'max-depth': ['error', 3],
  'max-lines': ['error', { max: 300 }],
  'max-params': ['error', 4],
  'no-process-env': 'error',
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...packageBoundaryPatterns,
        {
          group: ['../*'],
          message:
            'Relative imports from parent directories are forbidden. Use a package alias or inject dependencies.',
        },
      ],
    },
  ],
  'no-var': 'error',
  'perfectionist/sort-imports': 'off',
  'perfectionist/sort-objects': 'error',
  'security/detect-eval-with-expression': 'error',
  'security/detect-object-injection': 'error',
  'sonarjs/cognitive-complexity': ['error', 15],
  'unicorn/no-array-reduce': 'error',
  'unicorn/no-nested-ternary': 'error',
  'unicorn/no-useless-undefined': 'error',
  'unicorn/prefer-module': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unused-imports/no-unused-imports': 'error',
  'unused-imports/no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      vars: 'all',
    },
  ],
};

const hasUndefinedType = (node) =>
  node.types.some((typeNode) => typeNode.type === 'TSUndefinedKeyword');

const isParameterIdentifier = (node) =>
  Array.isArray(node.parent?.params) && node.parent.params.includes(node);

const isUndefinedArgumentType = (node) => {
  if (!hasUndefinedType(node) || node.parent?.type !== 'TSTypeAnnotation') {
    return false;
  }

  const annotatedNode = node.parent.parent;

  return (
    annotatedNode?.type === 'TSPropertySignature' ||
    (annotatedNode?.type === 'Identifier' &&
      isParameterIdentifier(annotatedNode))
  );
};

const localPlugin = {
  rules: {
    'no-undefined-argument-types': {
      create: (context) => ({
        TSUnionType: (node) => {
          if (!isUndefinedArgumentType(node)) {
            return;
          }

          context.report({
            message:
              'Do not accept `| undefined` in argument types. Use optional properties and omit absent values with conditional object spread at call sites.',
            node,
          });
        },
      }),
      meta: {
        docs: {
          description:
            'Disallow `| undefined` in function parameters and argument object properties.',
        },
        schema: [],
        type: 'problem',
      },
    },
  },
};

const rulePlugins = {
  'import-access': importAccess,
  'import-x': importX,
  local: localPlugin,
  perfectionist,
  security,
  sonarjs,
  unicorn,
  'unused-imports': unusedImports,
};

const getTsconfigRootDir = (configUrl) =>
  path.dirname(fileURLToPath(configUrl));

const createTypeScriptConfig = ({
  configUrl,
  extraConfigs = [],
  extraIgnores = [],
  extraRules = {},
  files,
  globals,
}) => [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ignores: [...defaultIgnores, ...extraIgnores],
  },
  js.configs.recommended,
  functional.configs.recommended,
  {
    files,
    languageOptions: {
      ecmaVersion: 'latest',
      globals,
      parser: typescriptParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: getTsconfigRootDir(configUrl),
      },
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    rules: typeScriptRules,
  },
  {
    files,
    plugins: rulePlugins,
    rules: {
      ...customRules,
      ...extraRules,
    },
  },
  ...extraConfigs,
  eslintConfigPrettier,
];

export const createNodePackageConfig = ({
  allowConsole = false,
  allowDefaultExport = false,
  allowTryStatements = false,
  configUrl,
  extraConfigs = [],
  extraGlobals = {},
  extraIgnores = [],
  extraRules = {},
}) =>
  createTypeScriptConfig({
    configUrl,
    extraConfigs,
    extraIgnores,
    extraRules: {
      'functional/no-try-statements': allowTryStatements ? 'off' : 'error',
      'import-x/no-default-export': allowDefaultExport ? 'off' : 'error',
      'no-console': allowConsole ? 'off' : 'error',
      ...extraRules,
    },
    files: ['**/*.ts'],
    globals: {
      ...nodeGlobals,
      ...extraGlobals,
    },
  });

export const createReactPackageConfig = ({
  allowConsole = false,
  allowDefaultExport = false,
  allowTryStatements = false,
  configUrl,
  extraConfigs = [],
  extraGlobals = {},
  extraIgnores = [],
  extraRules = {},
}) =>
  createTypeScriptConfig({
    configUrl,
    extraConfigs,
    extraIgnores,
    extraRules: {
      'functional/no-try-statements': allowTryStatements ? 'off' : 'error',
      'import-x/no-default-export': allowDefaultExport ? 'off' : 'error',
      'no-console': allowConsole ? 'off' : 'error',
      ...extraRules,
    },
    files: ['**/*.ts', '**/*.tsx'],
    globals: {
      ...browserGlobals,
      ...extraGlobals,
    },
  });

export const createRestrictedImportConfig = ({ files, patterns }) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...packageBoundaryPatterns,
          ...patterns.map((pattern) =>
            typeof pattern === 'string'
              ? { group: [pattern], message: layerImportMessage }
              : pattern
          ),
        ],
      },
    ],
  },
});

export const createToolingConfig = ({ configUrl }) => [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ...js.configs.recommended,
    files: ['*.mjs', '**/*.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: toolingGlobals,
      sourceType: 'module',
    },
    plugins: {
      unicorn,
      'unused-imports': unusedImports,
    },
    rules: toolingSharedRules,
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: toolingGlobals,
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: getTsconfigRootDir(configUrl),
      },
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      functional,
      local: localPlugin,
      security,
      unicorn,
      'unused-imports': unusedImports,
    },
    rules: toolingTypeScriptRules,
  },
  eslintConfigPrettier,
];
