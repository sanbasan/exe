import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import { buildSlackTaskMessageBlocks } from '#server/services/slack-task-message-blocks';
import type { Task, Workspace } from '@exe/domain';
import {
  buildTasksCreatedFromCallRootBlocks,
  buildTasksCreatedFromCallRootFallbackText,
} from '@exe/slack';

interface TaskCreatedFromCallDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

interface TaskCreatedFromCallMessage {
  readonly channelId: string;
  readonly messageTs: string;
  readonly taskId: string;
  readonly threadTs: string;
}

// Posts one channel anchor for a call session, then posts each task card as a
// reply in that anchor thread.
export const sendTasksCreatedFromCall = ({
  channelId,
  deps,
  sessionStartedAt,
  speakerSlackUserId,
  tasks,
  workspace,
}: {
  readonly channelId: string;
  readonly deps: TaskCreatedFromCallDeps;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly tasks: readonly Task[];
  readonly workspace: Workspace;
}): Promise<readonly TaskCreatedFromCallMessage[]> => {
  if (tasks.length === 0) {
    return Promise.resolve([]);
  }

  return withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({
      botToken,
    }): Promise<readonly TaskCreatedFromCallMessage[]> => {
      const threadTs = await deps.slackGateway.postMessage({
        blocks: buildTasksCreatedFromCallRootBlocks({
          language: workspace.language,
          sessionStartedAt,
          speakerSlackUserId,
          taskCount: tasks.length,
          timezone: workspace.timezone,
        }),
        botToken,
        channelId,
        text: buildTasksCreatedFromCallRootFallbackText({
          language: workspace.language,
          sessionStartedAt,
          speakerSlackUserId,
          taskCount: tasks.length,
          timezone: workspace.timezone,
        }),
        unfurlLinks: false,
      });
      return Promise.all(
        tasks.map(async (task) => {
          const messageTs = await deps.slackGateway.postMessage({
            blocks: await buildSlackTaskMessageBlocks({
              botToken,
              language: workspace.language,
              slackGateway: deps.slackGateway,
              task,
              timezone: workspace.timezone,
            }),
            botToken,
            channelId,
            text: task.title,
            threadTs,
            unfurlLinks: false,
          });

          return {
            channelId,
            messageTs,
            taskId: task.id,
            threadTs,
          };
        })
      );
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
