import { createNodePackageConfig } from '../eslint.shared.mjs';

export default createNodePackageConfig({
  allowConsole: true,
  configUrl: import.meta.url,
});
