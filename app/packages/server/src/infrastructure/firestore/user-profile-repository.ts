import type { UserProfileRepository } from '#server/ports';
import { userProfileCollectionPath, userProfileDocumentPath } from './paths';
import { getDocument, queryCollection, setDocument } from './repository-utils';
import { userProfileSchema, type UserProfile } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreUserProfileRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): UserProfileRepository => ({
  getById: ({ userId }): Promise<UserProfile | null> =>
    getDocument({
      firestore,
      path: userProfileDocumentPath(userId),
      schema: userProfileSchema,
    }),
  listByWorkspace: ({ workspaceId }): Promise<readonly UserProfile[]> =>
    queryCollection({
      firestore,
      path: userProfileCollectionPath,
      query: (collection) =>
        collection.where('workspaceIds', 'array-contains', workspaceId),
      schema: userProfileSchema,
    }),
  upsert: ({ userProfile }): Promise<void> =>
    setDocument({
      firestore,
      path: userProfileDocumentPath(userProfile.id),
      value: userProfile,
    }),
});
