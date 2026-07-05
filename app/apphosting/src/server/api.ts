import { createExeIosApi, createFirebaseServerComposition } from '@exe/server';
import type { ExeIosApi } from '@exe/server';

export const createRequestApi = (): ExeIosApi => {
  const composition = createFirebaseServerComposition();

  return createExeIosApi({ services: composition.services });
};
