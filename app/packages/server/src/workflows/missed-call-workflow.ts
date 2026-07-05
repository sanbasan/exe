import { getWorkspaceForUser } from '#server/workspace-access';
import {
  buildCallNotificationId,
  tryCreateCallNotification,
} from './call-notification-workflow-utils';
import type { CallWorkflowDeps } from './deps';
import type { CallSession } from '@exe/domain';

const notifyMissedSession = async ({
  deps,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
}): Promise<void> => {
  const shouldSend = await tryCreateCallNotification({
    deps,
    record: {
      callSessionId: session.id,
      createdAt: deps.clock.now(),
      id: buildCallNotificationId([
        'missed',
        session.workspaceId,
        session.userId,
        session.id,
      ]),
      kind: 'missed',
      userId: session.userId,
      workspaceId: session.workspaceId,
    },
  });

  if (!shouldSend) {
    return;
  }

  const { linkedSlackUser, workspace } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });

  await deps.notificationGateway.sendMissedCallNotice({
    session,
    slackUserId: linkedSlackUser.slackUserId,
    workspace,
  });
};

export const notifyMissedCalls = async ({
  deps,
}: {
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const sessions =
    await deps.callSessionRepository.listMissedWithoutNotification();

  await Promise.all(
    sessions.map((session) => notifyMissedSession({ deps, session }))
  );
};
