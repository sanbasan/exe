import type { App } from 'firebase-admin/app';
import { getApps, initializeApp } from 'firebase-admin/app';

export const getFirebaseApp = (): App => {
  const existingApp = getApps()[0];

  if (existingApp !== undefined) {
    return existingApp;
  }

  return initializeApp();
};
