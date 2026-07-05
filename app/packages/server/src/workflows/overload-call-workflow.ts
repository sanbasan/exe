import type { CallNotificationRecord } from '#server/ports';
import {
  findUserIdForSlackUser,
  startAutoCall,
} from '#server/services/auto-call';
import {
  buildCallNotificationId,
  tryCreateCallNotification,
} from './call-notification-workflow-utils';
import type { CallWorkflowDeps } from './deps';
import { getOverloadedAssignees, type Workspace } from '@exe/domain';

// Morning load check: for every workspace, find assignees whose open-task
// count crosses the overload threshold and place one agent call per person
// per local day. In that call the agent walks their tasks (descriptions mark
// what is movable) and proposes reassignments via the normal patch flow.

const localDayKey = ({
  at,
  timezone,
}: {
  readonly at: string;
  readonly timezone: string;
}): string =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).format(new Date(at));

const runForWorkspace = async ({
  at,
  deps,
  workspace,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
  readonly workspace: Workspace;
}): Promise<void> => {
  const tasks = await deps.taskRepository.listByWorkspace({
    workspaceId: workspace.id,
  });
  const overloaded = getOverloadedAssignees({ tasks });

  await Promise.all(
    overloaded.map(async (slackUserId): Promise<void> => {
      const userId = await findUserIdForSlackUser({
        slackUserId,
        userProfileRepository: deps.userProfileRepository,
        workspaceId: workspace.id,
      });

      if (userId === null) {
        return;
      }

      const dayKey = localDayKey({ at, timezone: workspace.timezone });
      const record: CallNotificationRecord = {
        createdAt: deps.clock.now(),
        id: buildCallNotificationId([
          'overload',
          workspace.id,
          slackUserId,
          dayKey,
        ]),
        kind: 'overload_call',
        targetRunAt: dayKey,
        userId,
        workspaceId: workspace.id,
      };
      const claimed = await tryCreateCallNotification({ deps, record });

      if (!claimed) {
        return;
      }

      await startAutoCall({
        deps: {
          callSessionService: deps.callSessionService,
          deviceTokenRepository: deps.deviceTokenRepository,
          notificationGateway: deps.notificationGateway,
          userProfileRepository: deps.userProfileRepository,
        },
        slackUserId,
        trigger: 'overload',
        workspace,
      });
    })
  );
};

export const startOverloadCalls = async ({
  at,
  deps,
}: {
  readonly at: string;
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const workspaces = await deps.workspaceRepository.listAll();

  await Promise.all(
    workspaces.map((workspace) =>
      runForWorkspace({ at, deps, workspace }).catch(
        (error: unknown): Promise<void> =>
          deps.errorReporter.report({
            context: { route: 'workflows/overload-calls' },
            error,
          })
      )
    )
  );
};
