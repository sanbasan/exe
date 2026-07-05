import { createReactPackageConfig } from '../eslint.shared.mjs';

export default createReactPackageConfig({
  allowDefaultExport: true,
  allowTryStatements: true,
  configUrl: import.meta.url,
  extraGlobals: {
    process: 'readonly',
  },
});
