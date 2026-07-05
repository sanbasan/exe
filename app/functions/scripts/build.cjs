const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '../dist');
const srcDir = path.join(__dirname, '../src');

const resolveFromApp = (...segments) =>
  path.resolve(__dirname, '../..', ...segments);

const resolveSourcePath = ({ baseDir, subpath }) => {
  const directPath = resolveFromApp(baseDir, `${subpath}.ts`);
  const indexPath = resolveFromApp(baseDir, subpath, 'index.ts');

  if (fs.existsSync(directPath)) {
    return directPath;
  }

  return indexPath;
};

const aliasPlugin = {
  name: 'alias',
  setup(builder) {
    builder.onResolve({ filter: /^#server\// }, (args) => ({
      path: resolveSourcePath({
        baseDir: 'packages/server/src',
        subpath: args.path.slice('#server/'.length),
      }),
    }));
    builder.onResolve({ filter: /^#slack\// }, (args) => ({
      path: resolveSourcePath({
        baseDir: 'packages/slack/src',
        subpath: args.path.slice('#slack/'.length),
      }),
    }));
    builder.onResolve({ filter: /^@exe\/domain$/ }, () => ({
      path: resolveFromApp('packages/domain/src/index.ts'),
    }));
    builder.onResolve({ filter: /^@exe\/server$/ }, () => ({
      path: resolveFromApp('packages/server/src/index.ts'),
    }));
    builder.onResolve({ filter: /^@exe\/slack$/ }, () => ({
      path: resolveFromApp('packages/slack/src/index.ts'),
    }));
  },
};

const removeWorkspaceDependencies = (packageJson) => {
  const dependencies = packageJson.dependencies ?? {};

  return {
    ...packageJson,
    dependencies: Object.fromEntries(
      Object.entries(dependencies).filter(([name]) => !name.startsWith('@exe/'))
    ),
  };
};

const writePackageJson = () => {
  const packageJson = removeWorkspaceDependencies(require('../package.json'));
  delete packageJson.devDependencies;
  delete packageJson.scripts;
  packageJson.main = 'index.js';

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
};

const main = async () => {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { force: true, recursive: true });
  }

  fs.mkdirSync(distDir);

  await build({
    bundle: true,
    entryPoints: [path.join(srcDir, 'index.ts')],
    external: [
      '@google/genai',
      '@livekit/protocol',
      '@sendgrid/mail',
      '@sentry/node',
      '@slack/types',
      '@slack/web-api',
      'firebase-admin',
      'firebase-functions',
      'google-auth-library',
      'livekit-server-sdk',
    ],
    format: 'esm',
    keepNames: true,
    logLevel: 'info',
    outfile: path.join(distDir, 'index.js'),
    platform: 'node',
    plugins: [aliasPlugin],
    sourcemap: 'linked',
    sourcesContent: true,
    target: 'node22',
  });

  writePackageJson();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
