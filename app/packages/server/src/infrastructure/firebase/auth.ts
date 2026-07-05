import type { AuthUserRecord, AuthGateway } from '#server/ports';
import { getFirebaseApp } from './app';
import { getAuth } from 'firebase-admin/auth';

const toAuthUserRecord = ({
  email,
  uid,
}: {
  readonly email?: string;
  readonly uid: string;
}): AuthUserRecord => ({
  ...(email === undefined ? {} : { email }),
  uid,
});

export const createFirebaseAuthGateway = (): AuthGateway => {
  const auth = getAuth(getFirebaseApp());

  return {
    createCustomToken: ({ uid }): Promise<string> =>
      auth.createCustomToken(uid),
    createUser: async ({ email }): Promise<AuthUserRecord> => {
      const user = await auth.createUser({ email, emailVerified: true });

      return toAuthUserRecord({
        ...(user.email === undefined ? {} : { email: user.email }),
        uid: user.uid,
      });
    },
    getUserByEmail: ({ email }): Promise<AuthUserRecord | null> =>
      auth
        .getUserByEmail(email)
        .then((user) =>
          toAuthUserRecord({
            ...(user.email === undefined ? {} : { email: user.email }),
            uid: user.uid,
          })
        )
        .catch(() => null),
  };
};
