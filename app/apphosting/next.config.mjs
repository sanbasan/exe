import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directoryName = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  distDir: '../.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(directoryName, '../'),
  reactStrictMode: true,
  transpilePackages: ['@exe/domain', '@exe/server', '@exe/slack'],
  typescript: {
    // CI/local quality runs `npm run type-check`; App Hosting build should not
    // spend rollout time repeating the same TypeScript validation.
    ignoreBuildErrors: true,
  },
  typedRoutes: true,
};

export default nextConfig;
