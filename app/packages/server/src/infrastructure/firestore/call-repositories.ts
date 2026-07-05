import type {
  CallNotificationKind,
  CallEventRepository,
  CallNotificationRecord,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
} from '#server/ports';
import {
  callEventCollectionPath,
  callNotificationCollectionPath,
  callScheduleCollectionId,
  callScheduleDocumentPath,
  callSessionCollectionId,
  callSessionDocumentPath,
} from './paths';
import {
  createDocument,
  getDocument,
  queryCollection,
  queryCollectionGroup,
  setDocument,
  updateDocument,
} from './repository-utils';
import {
  callEventSchema,
  callScheduleSchema,
  callSessionSchema,
  type CallEvent,
  type CallSchedule,
  type CallSession,
} from '@exe/domain';
import type { Firestore } from 'firebase-admin/firestore';

const isCallNotificationRecord = (
  value: unknown
): value is CallNotificationRecord => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'createdAt' in value &&
    'id' in value &&
    'kind' in value &&
    'userId' in value &&
    'workspaceId' in value
  );
};

const scheduledRunNotificationKinds: readonly CallNotificationKind[] = [
  'prenotification',
  'scheduled_call_due',
];

export const createFirestoreCallEventRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): CallEventRepository => ({
  create: ({ event }): Promise<void> =>
    createDocument({
      firestore,
      path: `${callEventCollectionPath(event.workspaceId)}/${event.id}`,
      value: event,
    }),
  listByCallSessionId: ({
    callSessionId,
    workspaceId,
  }): Promise<readonly CallEvent[]> =>
    queryCollection({
      firestore,
      path: callEventCollectionPath(workspaceId),
      query: (collection) =>
        collection
          .where('callSessionId', '==', callSessionId)
          .orderBy('createdAt', 'asc'),
      schema: callEventSchema,
    }),
});

export const createFirestoreCallNotificationRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): CallNotificationRepository => ({
  create: ({ record }): Promise<void> =>
    createDocument({
      firestore,
      path: `${callNotificationCollectionPath(record.workspaceId)}/${record.id}`,
      value: record,
    }),
  exists: async ({
    callSessionId,
    kind,
    targetRunAt,
    userId,
    workspaceId,
  }): Promise<boolean> => {
    const matches = await queryCollection({
      firestore,
      path: callNotificationCollectionPath(workspaceId),
      query: (collection) => {
        const baseQuery = collection
          .where('kind', '==', kind)
          .where('userId', '==', userId);
        const targetRunQuery =
          targetRunAt === undefined
            ? baseQuery
            : baseQuery.where('targetRunAt', '==', targetRunAt);
        const callSessionQuery =
          callSessionId === undefined
            ? targetRunQuery
            : targetRunQuery.where('callSessionId', '==', callSessionId);

        return callSessionQuery.limit(1);
      },
      schema: { safeParse: (value) => ({ data: value, success: true }) },
    });

    return matches.filter(isCallNotificationRecord).length > 0;
  },
  listByScheduledRun: ({
    targetRunAt,
    userId,
    workspaceId,
  }): Promise<readonly CallNotificationRecord[]> =>
    queryCollection({
      firestore,
      path: callNotificationCollectionPath(workspaceId),
      query: (collection) =>
        collection
          .where('kind', 'in', scheduledRunNotificationKinds)
          .where('targetRunAt', '==', targetRunAt)
          .where('userId', '==', userId),
      schema: { safeParse: (value) => ({ data: value, success: true }) },
    }).then((records) => records.filter(isCallNotificationRecord)),
  updateSlackMessage: ({
    notificationId,
    slackMessage,
    workspaceId,
  }): Promise<void> =>
    // Partial write: only slackMessage is passed, so merge is required.
    setDocument({
      firestore,
      path: `${callNotificationCollectionPath(workspaceId)}/${notificationId}`,
      value: { slackMessage },
    }),
});

export const createFirestoreCallScheduleRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): CallScheduleRepository => ({
  getById: ({ callScheduleId, workspaceId }): Promise<CallSchedule | null> =>
    getDocument({
      firestore,
      path: callScheduleDocumentPath({ callScheduleId, workspaceId }),
      schema: callScheduleSchema,
    }),
  getByUser: async ({ userId, workspaceId }): Promise<CallSchedule | null> => {
    const schedules = await queryCollectionGroup({
      collectionId: callScheduleCollectionId,
      firestore,
      query: (collection) =>
        collection
          .where('userId', '==', userId)
          .where('workspaceId', '==', workspaceId)
          .limit(1),
      schema: callScheduleSchema,
    });

    return schedules[0] ?? null;
  },
  listEnabled: (): Promise<readonly CallSchedule[]> =>
    queryCollectionGroup({
      collectionId: callScheduleCollectionId,
      firestore,
      query: (collection) => collection.where('enabled', '==', true),
      schema: callScheduleSchema,
    }),
  upsert: ({ schedule }): Promise<void> =>
    setDocument({
      firestore,
      path: callScheduleDocumentPath({
        callScheduleId: schedule.id,
        workspaceId: schedule.workspaceId,
      }),
      value: schedule,
    }),
});

export const createFirestoreCallSessionRepository = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): CallSessionRepository => ({
  create: ({ session }): Promise<void> =>
    createDocument({
      firestore,
      path: callSessionDocumentPath({
        callSessionId: session.id,
        workspaceId: session.workspaceId,
      }),
      value: session,
    }),
  getById: ({ callSessionId, workspaceId }): Promise<CallSession | null> =>
    getDocument({
      firestore,
      path: callSessionDocumentPath({ callSessionId, workspaceId }),
      schema: callSessionSchema,
    }),
  listBusyForLiveKitIdleCheck: ({
    createdAfter,
  }): Promise<readonly CallSession[]> =>
    Promise.all([
      queryCollectionGroup({
        collectionId: callSessionCollectionId,
        firestore,
        query: (collection) =>
          collection.where('status', 'in', ['active', 'ringing']),
        schema: callSessionSchema,
      }),
      queryCollectionGroup({
        collectionId: callSessionCollectionId,
        firestore,
        query: (collection) =>
          collection
            .where('status', '==', 'created')
            .where('createdAt', '>=', createdAfter),
        schema: callSessionSchema,
      }),
    ]).then(([activeSessions, recentCreatedSessions]) => [
      ...activeSessions,
      ...recentCreatedSessions,
    ]),
  listEndedWithoutSummary: async (): Promise<readonly CallSession[]> => {
    const sessions = await queryCollectionGroup({
      collectionId: callSessionCollectionId,
      firestore,
      query: (collection) => collection.where('status', '==', 'ended'),
      schema: callSessionSchema,
    });

    return sessions.filter((session) => session.summary === undefined);
  },
  listMissedWithoutNotification: (): Promise<readonly CallSession[]> =>
    queryCollectionGroup({
      collectionId: callSessionCollectionId,
      firestore,
      query: (collection) => collection.where('status', '==', 'missed'),
      schema: callSessionSchema,
    }),
  update: ({ session }): Promise<void> =>
    updateDocument({
      firestore,
      path: callSessionDocumentPath({
        callSessionId: session.id,
        workspaceId: session.workspaceId,
      }),
      value: session,
    }),
});
