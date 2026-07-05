import type { ChannelEventRepository, ChannelRepository } from '#server/ports';
import {
  channelCollectionPath,
  channelDocumentPath,
  channelEventCollectionPath,
} from './paths';
import {
  getDocument,
  listCollection,
  queryCollection,
  setDocument,
} from './repository-utils';
import {
  channelEventSchema,
  channelSchema,
  type Channel,
  type ChannelEvent,
} from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreChannelRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): ChannelRepository => ({
  getById: ({ channelId, workspaceId }): Promise<Channel | null> =>
    getDocument({
      firestore,
      path: channelDocumentPath({ channelId, workspaceId }),
      schema: channelSchema,
    }),
  listByWorkspace: ({ workspaceId }): Promise<readonly Channel[]> =>
    listCollection({
      firestore,
      path: channelCollectionPath(workspaceId),
      schema: channelSchema,
    }),
  upsert: ({ channel }): Promise<void> =>
    setDocument({
      firestore,
      path: channelDocumentPath({
        channelId: channel.channelId,
        workspaceId: channel.workspaceId,
      }),
      value: channel,
    }),
});

export const createFirestoreChannelEventRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): ChannelEventRepository => ({
  create: ({ event }): Promise<void> =>
    setDocument({
      firestore,
      path: `${channelEventCollectionPath(event.workspaceId)}/${event.id}`,
      value: event,
    }),
  listByChannel: ({
    channelId,
    workspaceId,
  }): Promise<readonly ChannelEvent[]> =>
    queryCollection({
      firestore,
      path: channelEventCollectionPath(workspaceId),
      query: (collection) =>
        collection
          .where('channelId', '==', channelId)
          .orderBy('occurredAt', 'desc'),
      schema: channelEventSchema,
    }),
});
