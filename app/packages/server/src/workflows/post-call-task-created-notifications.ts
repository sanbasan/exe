import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallWorkflowDeps } from './deps';
import { taskSchema, type CallSession, type Task } from '@exe/domain';

interface NotifyTasksCreatedFromCallParams {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly tasks: readonly Task[];
}

interface TaskCreatedFromCallChannelGroup {
  readonly channelId: string;
  readonly tasks: readonly Task[];
}

const groupTasksByChannelId = (
  tasks: readonly Task[]
): readonly TaskCreatedFromCallChannelGroup[] =>
  [
    ...new Set(
      tasks.flatMap((task) =>
        task.channelId === undefined ? [] : [task.channelId]
      )
    ),
  ].map((channelId) => ({
    channelId,
    tasks: tasks.filter((task) => task.channelId === channelId),
  }));

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportTaskCreatedNotificationError = ({
  channelId,
  deps,
  error,
  session,
  tasks,
}: NotifyTasksCreatedFromCallParams &
  TaskCreatedFromCallChannelGroup & {
    readonly error: unknown;
  }): Promise<void> =>
  deps.errorReporter
    .report({
      context: {
        route: 'workflows/finalizeEndedCalls/task-created-notification',
      },
      error: new Error(
        [
          'Post-call task created notification failed',
          `callSessionId=${session.id}`,
          `workspaceId=${session.workspaceId}`,
          `channelId=${channelId}`,
          `taskIds=${tasks.map((task) => task.id).join(',')}`,
          `message=${getErrorMessage(error)}`,
        ].join(' ')
      ),
    })
    .catch((): void => undefined);

const notifyTaskCreatedFromCallChannel = async ({
  channelId,
  deps,
  session,
  tasks,
}: NotifyTasksCreatedFromCallParams &
  TaskCreatedFromCallChannelGroup): Promise<void> => {
  const { linkedSlackUser, workspace } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });
  const messages = await deps.notificationGateway.sendTasksCreatedFromCall({
    channelId,
    sessionStartedAt: session.startedAt ?? session.createdAt,
    speakerSlackUserId: linkedSlackUser.slackUserId,
    tasks,
    workspace,
  });

  await Promise.all(
    messages.map((message) => {
      const task = tasks.find((candidate) => candidate.id === message.taskId);

      if (task === undefined) {
        return Promise.resolve();
      }

      return deps.taskRepository.update({
        task: taskSchema.parse({
          ...task,
          messageTs: message.messageTs,
          threadTs: message.threadTs,
          updatedAt: deps.clock.now(),
        }),
      });
    })
  );
};

const notifyTasksCreatedFromCall = async ({
  deps,
  session,
  tasks,
}: NotifyTasksCreatedFromCallParams): Promise<void> => {
  const groups = groupTasksByChannelId(tasks);

  await Promise.all(
    groups.map((group) =>
      notifyTaskCreatedFromCallChannel({
        ...group,
        deps,
        session,
        tasks: group.tasks,
      }).catch((error: unknown) =>
        reportTaskCreatedNotificationError({
          ...group,
          deps,
          error,
          session,
          tasks: group.tasks,
        })
      )
    )
  );
};

// Notifying Slack is best effort: a failed channel post must never fail the
// task creation that already happened.
export const notifyTasksCreatedFromCallBestEffort = (
  params: NotifyTasksCreatedFromCallParams
): Promise<void> => notifyTasksCreatedFromCall(params);
