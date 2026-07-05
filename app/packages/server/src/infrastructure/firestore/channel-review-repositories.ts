import type {
  ChannelBlockRepository,
  ChannelReviewStateRepository,
} from '#server/ports';
import {
  channelBlockCollectionPath,
  channelBlockDocumentPath,
  channelReviewStateCollectionPath,
  channelReviewStateDocumentPath,
} from './paths';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listCollection,
  setDocument,
  updateDocument,
} from './repository-utils';
import {
  channelBlockSchema,
  channelReviewStateDocumentId,
  channelReviewStateSchema,
  type ChannelBlock,
  type ChannelReviewState,
} from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreChannelBlockRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): ChannelBlockRepository => ({
  create: ({ block }): Promise<void> =>
    createDocument({
      firestore,
      path: channelBlockDocumentPath({
        blockId: block.id,
        workspaceId: block.workspaceId,
      }),
      value: block,
    }),
  delete: ({ blockId, workspaceId }): Promise<void> =>
    deleteDocument({
      firestore,
      path: channelBlockDocumentPath({ blockId, workspaceId }),
    }),
  getById: ({ blockId, workspaceId }): Promise<ChannelBlock | null> =>
    getDocument({
      firestore,
      path: channelBlockDocumentPath({ blockId, workspaceId }),
      schema: channelBlockSchema,
    }),
  listByWorkspace: ({ workspaceId }): Promise<readonly ChannelBlock[]> =>
    listCollection({
      firestore,
      path: channelBlockCollectionPath(workspaceId),
      schema: channelBlockSchema,
    }),
  update: ({ block }): Promise<void> =>
    updateDocument({
      firestore,
      path: channelBlockDocumentPath({
        blockId: block.id,
        workspaceId: block.workspaceId,
      }),
      value: block,
    }),
});

export const createFirestoreChannelReviewStateRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): ChannelReviewStateRepository => ({
  getByChannelAndUser: ({
    channelId,
    slackUserId,
    workspaceId,
  }): Promise<ChannelReviewState | null> =>
    getDocument({
      firestore,
      path: channelReviewStateDocumentPath({
        stateId: channelReviewStateDocumentId({ channelId, slackUserId }),
        workspaceId,
      }),
      schema: channelReviewStateSchema,
    }),
  listByWorkspace: ({ workspaceId }): Promise<readonly ChannelReviewState[]> =>
    listCollection({
      firestore,
      path: channelReviewStateCollectionPath(workspaceId),
      schema: channelReviewStateSchema,
    }),
  upsert: ({ state }): Promise<void> =>
    setDocument({
      firestore,
      path: channelReviewStateDocumentPath({
        stateId: state.id,
        workspaceId: state.workspaceId,
      }),
      value: state,
    }),
});
