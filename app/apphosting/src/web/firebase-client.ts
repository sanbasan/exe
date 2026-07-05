import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { z } from 'zod';

const firebaseConfigSchema = z
  .object({
    apiKey: z.string().min(1),
    appId: z.string().min(1).optional(),
    authDomain: z.string().min(1),
    messagingSenderId: z.string().min(1).optional(),
    projectId: z.string().min(1),
  })
  .loose();

type FirebaseWebConfig = z.infer<typeof firebaseConfigSchema>;

/* eslint-disable-next-line functional/no-let -- Module-level memoized auth promise by design. */
let authPromise: Promise<Auth> | null = null;

const fetchFirebaseConfig = async (): Promise<FirebaseWebConfig> => {
  const response = await fetch('/api/public/firebase-config');
  if (!response.ok) {
    throw new Error('Failed to load Firebase configuration.');
  }
  const json: unknown = await response.json();
  return firebaseConfigSchema.parse(json);
};

const buildApp = (config: FirebaseWebConfig): FirebaseApp => {
  const existing = getApps();
  if (existing.length > 0) {
    const [app] = existing;
    if (app !== undefined) {
      return app;
    }
  }
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    ...(config.appId === undefined ? {} : { appId: config.appId }),
    ...(config.messagingSenderId === undefined
      ? {}
      : { messagingSenderId: config.messagingSenderId }),
  });
};

const initAuth = async (): Promise<Auth> => {
  const config = await fetchFirebaseConfig();
  const auth = getAuth(buildApp(config));
  await setPersistence(auth, browserLocalPersistence);
  return auth;
};

export const getFirebaseAuth = (): Promise<Auth> => {
  authPromise ??= initAuth();
  return authPromise;
};

export const signInWithCustomTokenHelper = async ({
  token,
}: {
  readonly token: string;
}): Promise<User> => {
  const auth = await getFirebaseAuth();
  const credential = await signInWithCustomToken(auth, token);
  return credential.user;
};

export const onAuthChanged = ({
  callback,
}: {
  readonly callback: (user: User | null) => void;
}): (() => void) => {
  /* eslint-disable functional/no-let -- Subscription handle arrives asynchronously; the cleanup closure needs the latest value. */
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  /* eslint-enable functional/no-let */
  void getFirebaseAuth().then((auth) => {
    if (cancelled) {
      return;
    }
    unsubscribe = onAuthStateChanged(auth, callback);
  });
  return (): void => {
    cancelled = true;
    if (unsubscribe !== null) {
      unsubscribe();
    }
  };
};

export const signOutHelper = async (): Promise<void> => {
  const auth = await getFirebaseAuth();
  await signOut(auth);
};

export const getCurrentIdToken = async ({
  forceRefresh,
}: {
  readonly forceRefresh: boolean;
}): Promise<string | null> => {
  const auth = await getFirebaseAuth();
  const { currentUser } = auth;
  if (currentUser === null) {
    return null;
  }
  return currentUser.getIdToken(forceRefresh);
};

export type { User };
