import {
  createNodePackageConfig,
  createRestrictedImportConfig,
} from '../../eslint.shared.mjs';

export default createNodePackageConfig({
  configUrl: import.meta.url,
  extraConfigs: [
    createRestrictedImportConfig({
      files: ['src/**/*.ts'],
      patterns: [
        '@exe/agent',
        '@exe/agent/*',
        '@exe/apphosting',
        '@exe/apphosting/*',
        '@exe/functions',
        '@exe/functions/*',
        '@exe/server',
        '@exe/server/*',
        '@exe/slack',
        '@exe/slack/*',
        'firebase',
        'firebase/*',
        'firebase-admin',
        'firebase-admin/*',
        'livekit-server-sdk',
        'livekit-server-sdk/*',
        'next',
        'next/*',
        'node:*',
        'react',
        'react/*',
        '@slack/bolt',
        '@slack/bolt/*',
        '@slack/web-api',
        '@slack/web-api/*',
      ],
    }),
  ],
});
