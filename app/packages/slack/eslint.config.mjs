import { createNodePackageConfig } from '../../eslint.shared.mjs';

export default createNodePackageConfig({
  configUrl: import.meta.url,
});
