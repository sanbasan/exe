import type { TaskRepository } from '#server/ports';
import { taskCollectionPath, taskDocumentPath } from './paths';
import {
  createDocument,
  getDocument,
  listCollection,
  queryCollection,
  updateDocument,
} from './repository-utils';
import { taskSchema, type Task } from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

export const createFirestoreTaskRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): TaskRepository => ({
  create: ({ task }): Promise<void> =>
    createDocument({
      firestore,
      path: taskDocumentPath({
        taskId: task.id,
        workspaceId: task.workspaceId,
      }),
      value: task,
    }),
  getById: ({ taskId, workspaceId }): Promise<Task | null> =>
    getDocument({
      firestore,
      path: taskDocumentPath({ taskId, workspaceId }),
      schema: taskSchema,
    }),
  listByAssignee: ({ slackUserId, workspaceId }): Promise<readonly Task[]> =>
    queryCollection({
      firestore,
      path: taskCollectionPath(workspaceId),
      query: (collection) =>
        collection.where('assigneeSlackUserIds', 'array-contains', slackUserId),
      schema: taskSchema,
    }),
  listByRequester: ({ slackUserId, workspaceId }): Promise<readonly Task[]> =>
    queryCollection({
      firestore,
      path: taskCollectionPath(workspaceId),
      query: (collection) =>
        collection.where(
          'requesterSlackUserIds',
          'array-contains',
          slackUserId
        ),
      schema: taskSchema,
    }),
  listByWorkspace: ({ workspaceId }): Promise<readonly Task[]> =>
    listCollection({
      firestore,
      path: taskCollectionPath(workspaceId),
      schema: taskSchema,
    }),
  update: ({ task }): Promise<void> =>
    updateDocument({
      firestore,
      path: taskDocumentPath({
        taskId: task.id,
        workspaceId: task.workspaceId,
      }),
      value: task,
    }),
});
