import type { SignInCodeRepository } from '#server/ports';
import { signInCodeCollectionPath, signInCodeDocumentPath } from './paths';
import {
  createDocument,
  deleteDocument,
  queryCollection,
} from './repository-utils';
import { signInCodeSchema, type SignInCode } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreSignInCodeRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): SignInCodeRepository => ({
  create: ({ signInCode }): Promise<void> =>
    createDocument({
      firestore,
      path: signInCodeDocumentPath(signInCode.id),
      value: signInCode,
    }),
  deleteById: ({ signInCodeId }): Promise<void> =>
    deleteDocument({
      firestore,
      path: signInCodeDocumentPath(signInCodeId),
    }),
  findByEmailAndCode: async ({ code, email }): Promise<SignInCode | null> => {
    const signInCodes = await queryCollection({
      firestore,
      path: signInCodeCollectionPath,
      query: (collection) =>
        collection
          .where('email', '==', email)
          .where('code', '==', code)
          .limit(1),
      schema: signInCodeSchema,
    });
    const [signInCode] = signInCodes;

    return signInCode ?? null;
  },
});
