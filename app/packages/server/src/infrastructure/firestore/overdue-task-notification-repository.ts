import type { OverdueTaskNotificationRepository } from '#server/ports';
import {
  overdueTaskNotificationCollectionPath,
  overdueTaskNotificationDocumentPath,
} from './paths';
import { createDocument, queryCollection } from './repository-utils';
import {
  overdueTaskNotificationSchema,
  type OverdueTaskNotification,
} from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreOverdueTaskNotificationRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): OverdueTaskNotificationRepository => ({
  create: ({ notification }): Promise<void> =>
    createDocument({
      firestore,
      path: overdueTaskNotificationDocumentPath({
        notificationId: notification.id,
        taskId: notification.taskId,
        workspaceId: notification.workspaceId,
      }),
      value: notification,
    }),
  deleteByTask: async ({ taskId, workspaceId }): Promise<void> => {
    const snapshot = await firestore
      .collection(
        overdueTaskNotificationCollectionPath({ taskId, workspaceId })
      )
      .get();

    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  },
  listByTask: ({
    taskId,
    workspaceId,
  }): Promise<readonly OverdueTaskNotification[]> =>
    queryCollection({
      firestore,
      path: overdueTaskNotificationCollectionPath({ taskId, workspaceId }),
      query: (collection) => collection.orderBy('createdAt', 'desc'),
      schema: overdueTaskNotificationSchema,
    }),
});
