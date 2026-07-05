/* eslint-disable no-process-env -- Firebase web app config boundary. */

// App Hosting injects the web app's Firebase config as JSON in
// FIREBASE_WEBAPP_CONFIG; FIREBASE_CONFIG is the admin-side fallback.
export const readFirebaseWebAppConfigJson = (): string | undefined => {
  const raw =
    process.env['FIREBASE_WEBAPP_CONFIG'] ?? process.env['FIREBASE_CONFIG'];

  return raw === undefined || raw.length === 0 ? undefined : raw;
};
