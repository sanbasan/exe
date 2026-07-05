import type { SlackMemberIndexRepository } from '#server/ports';
import {
  slackMemberIndexCollectionPath,
  slackMemberIndexDocumentPath,
} from './paths';
import {
  deleteDocument,
  queryCollection,
  setDocument,
} from './repository-utils';
import {
  slackMemberIndexEntrySchema,
  type SlackMemberIndexEntry,
} from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreSlackMemberIndexRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): SlackMemberIndexRepository => ({
  deleteEntry: ({ slackUserId, workspaceId }): Promise<void> =>
    deleteDocument({
      firestore,
      path: slackMemberIndexDocumentPath({ slackUserId, workspaceId }),
    }),
  listByEmail: ({ email }): Promise<readonly SlackMemberIndexEntry[]> =>
    queryCollection({
      firestore,
      path: slackMemberIndexCollectionPath,
      query: (collection) => collection.where('email', '==', email),
      schema: slackMemberIndexEntrySchema,
    }),
  upsert: ({ entry }): Promise<void> =>
    setDocument({
      firestore,
      path: slackMemberIndexDocumentPath({
        slackUserId: entry.slackUserId,
        workspaceId: entry.workspaceId,
      }),
      value: entry,
    }),
});
