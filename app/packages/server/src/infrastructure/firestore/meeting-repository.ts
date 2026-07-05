import type { MeetingRepository } from '#server/ports';
import { meetingCollectionPath, meetingDocumentPath } from './paths';
import {
  createDocument,
  getDocument,
  listCollection,
  updateDocument,
} from './repository-utils';
import { meetingSchema, type Meeting } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreMeetingRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): MeetingRepository => ({
  create: ({ meeting }): Promise<void> =>
    createDocument({
      firestore,
      path: meetingDocumentPath({
        meetingId: meeting.id,
        workspaceId: meeting.workspaceId,
      }),
      value: meeting,
    }),
  getById: ({ meetingId, workspaceId }): Promise<Meeting | null> =>
    getDocument({
      firestore,
      path: meetingDocumentPath({ meetingId, workspaceId }),
      schema: meetingSchema,
    }),
  listByWorkspace: async ({ workspaceId }): Promise<readonly Meeting[]> => {
    const meetings = await listCollection({
      firestore,
      path: meetingCollectionPath(workspaceId),
      schema: meetingSchema,
    });
    return meetings.toSorted((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  },
  update: ({ meeting }): Promise<void> =>
    updateDocument({
      firestore,
      path: meetingDocumentPath({
        meetingId: meeting.id,
        workspaceId: meeting.workspaceId,
      }),
      value: meeting,
    }),
});
