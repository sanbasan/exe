import type { WorkspaceRepository } from '#server/ports';
import {
  workspaceCollectionPath,
  workspaceDocumentPath,
  workspaceSlackTokenLockDocumentPath,
} from './paths';
import {
  chunk,
  getDocument,
  listCollection,
  queryCollection,
  setDocument,
} from './repository-utils';
import { workspaceSchema, type Workspace } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

const isLiveLock = ({
  expiresAt,
  now,
}: {
  readonly expiresAt: unknown;
  readonly now: string;
}): boolean =>
  typeof expiresAt === 'string' && Date.parse(expiresAt) > Date.parse(now);

export const createFirestoreWorkspaceRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): WorkspaceRepository => ({
  acquireTokenRefreshLock: ({
    expiresAt,
    now,
    ownerId,
    workspaceId,
  }): Promise<boolean> =>
    firestore.runTransaction(async (transaction): Promise<boolean> => {
      const reference = firestore.doc(
        workspaceSlackTokenLockDocumentPath(workspaceId)
      );
      const snapshot = await transaction.get(reference);

      if (
        snapshot.exists &&
        isLiveLock({ expiresAt: snapshot.get('expiresAt'), now })
      ) {
        return false;
      }

      transaction.set(reference, {
        expiresAt,
        ownerId,
        updatedAt: now,
      });

      return true;
    }),
  getById: ({ workspaceId }): Promise<Workspace | null> =>
    getDocument({
      firestore,
      path: workspaceDocumentPath(workspaceId),
      schema: workspaceSchema,
    }),
  listAll: (): Promise<readonly Workspace[]> =>
    listCollection({
      firestore,
      path: workspaceCollectionPath,
      schema: workspaceSchema,
    }),
  listByIds: async ({ workspaceIds }): Promise<readonly Workspace[]> => {
    if (workspaceIds.length === 0) {
      return [];
    }

    const batches = await Promise.all(
      chunk(workspaceIds).map((workspaceIdBatch) =>
        queryCollection({
          firestore,
          path: workspaceCollectionPath,
          query: (collection) =>
            collection.where('id', 'in', [...workspaceIdBatch]),
          schema: workspaceSchema,
        })
      )
    );

    return batches.flat();
  },
  releaseTokenRefreshLock: ({ ownerId, workspaceId }): Promise<void> =>
    firestore.runTransaction(async (transaction): Promise<void> => {
      const reference = firestore.doc(
        workspaceSlackTokenLockDocumentPath(workspaceId)
      );
      const snapshot = await transaction.get(reference);

      if (snapshot.exists && snapshot.get('ownerId') === ownerId) {
        transaction.delete(reference);
      }
    }),
  updateTokens: ({ tokens, workspaceId }): Promise<void> =>
    // Partial write: only the token fields are passed, so merge is required.
    setDocument({
      firestore,
      path: workspaceDocumentPath(workspaceId),
      value: tokens,
    }),
  upsert: ({ workspace }): Promise<void> =>
    setDocument({
      firestore,
      path: workspaceDocumentPath(workspace.id),
      value: workspace,
    }),
});
