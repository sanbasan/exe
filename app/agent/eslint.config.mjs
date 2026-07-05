import { createNodePackageConfig } from '../eslint.shared.mjs';

export default createNodePackageConfig({
  allowDefaultExport: true,
  configUrl: import.meta.url,
});
