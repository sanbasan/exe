import { getFirebaseApp, unauthenticatedError } from '@exe/server';
import type { AuthenticatedContext } from '@exe/server';
import { getAuth } from 'firebase-admin/auth';
import type { NextRequest } from 'next/server';

const BEARER_PREFIX = 'Bearer ';

export const authenticateRequest = async (
  request: NextRequest
): Promise<AuthenticatedContext> => {
  const authorization = request.headers.get('authorization');

  if (authorization?.startsWith(BEARER_PREFIX) !== true) {
    throw unauthenticatedError('Authorization bearer token is required.');
  }

  const token = authorization.slice(BEARER_PREFIX.length);
  const decodedToken = await getAuth(getFirebaseApp()).verifyIdToken(token);

  return { userId: decodedToken.uid };
};
