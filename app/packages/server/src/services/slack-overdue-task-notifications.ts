import type {
  Clock,
  OverdueTaskNotificationRepository,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';

export interface SlackOverdueTaskNotificationDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

export const deleteSlackOverdueTaskNotifications = async ({
  deps,
  taskId,
  workspaceId,
}: {
  readonly deps: SlackOverdueTaskNotificationDeps;
  readonly taskId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  const [notifications, workspace] = await Promise.all([
    deps.overdueTaskNotificationRepository.listByTask({ taskId, workspaceId }),
    deps.workspaceRepository.getById({ workspaceId }),
  ]);

  if (notifications.length === 0) {
    return;
  }

  if (workspace !== null) {
    await withSlackBotToken({
      clock: deps.clock,
      ...(deps.encryptionKey === undefined
        ? {}
        : { encryptionKey: deps.encryptionKey }),
      run: async ({ botToken }): Promise<void> => {
        await Promise.allSettled(
          notifications.map((notification) =>
            deps.slackGateway.deleteMessage({
              botToken,
              channelId: notification.slack.channelId,
              messageTs: notification.slack.messageTs,
            })
          )
        );
      },
      slackGateway: deps.slackGateway,
      workspace,
      workspaceRepository: deps.workspaceRepository,
    });
  }

  await deps.overdueTaskNotificationRepository.deleteByTask({
    taskId,
    workspaceId,
  });
};
