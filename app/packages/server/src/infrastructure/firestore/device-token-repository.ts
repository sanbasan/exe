import type { DeviceTokenRepository } from '#server/ports';
import { deviceTokenCollectionPath, deviceTokenDocumentPath } from './paths';
import { chunk, queryCollection, setDocument } from './repository-utils';
import { deviceTokenSchema, type DeviceToken } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreDeviceTokenRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): DeviceTokenRepository => ({
  listByUser: ({ userId }): Promise<readonly DeviceToken[]> =>
    queryCollection({
      firestore,
      path: deviceTokenCollectionPath,
      query: (collection) => collection.where('userId', '==', userId),
      schema: deviceTokenSchema,
    }),
  removeByRegistration: async ({ environment, kind, token }): Promise<void> => {
    const matches = await queryCollection({
      firestore,
      path: deviceTokenCollectionPath,
      query: (collection) => collection.where('token', '==', token),
      schema: deviceTokenSchema,
    });

    await Promise.all(
      matches
        .filter(
          (deviceToken) =>
            deviceToken.environment === environment && deviceToken.kind === kind
        )
        .map((deviceToken) =>
          firestore.doc(deviceTokenDocumentPath(deviceToken.id)).delete()
        )
    );
  },
  removeByTokens: async ({ tokens }): Promise<void> => {
    if (tokens.length === 0) {
      return;
    }

    const batches = await Promise.all(
      chunk(tokens).map((tokenBatch) =>
        queryCollection({
          firestore,
          path: deviceTokenCollectionPath,
          query: (collection) =>
            collection.where('token', 'in', [...tokenBatch]),
          schema: deviceTokenSchema,
        })
      )
    );

    await Promise.all(
      batches
        .flat()
        .map((token) =>
          firestore.doc(deviceTokenDocumentPath(token.id)).delete()
        )
    );
  },
  upsert: ({ deviceToken }): Promise<void> =>
    setDocument({
      firestore,
      path: deviceTokenDocumentPath(deviceToken.id),
      value: deviceToken,
    }),
});
