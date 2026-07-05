import { createToolingConfig } from './eslint.shared.mjs';

export default createToolingConfig({
  configUrl: import.meta.url,
});
