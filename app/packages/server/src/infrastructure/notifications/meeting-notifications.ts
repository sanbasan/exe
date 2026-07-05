import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import { buildSlackTaskMessageBlocks } from '#server/services/slack-task-message-blocks';
import type { Task, Workspace } from '@exe/domain';
import {
  buildMeetingTasksRootBlocks,
  buildMeetingTasksRootFallbackText,
  buildTaskDependencyNoticeBlocks,
  buildTaskDependencyNoticeFallbackText,
} from '@exe/slack';

interface MeetingNotificationDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

export interface MeetingTasksCreatedResult {
  readonly anchorTs: string;
  readonly channelId: string;
  readonly taskMessages: readonly {
    readonly messageTs: string;
    readonly taskId: string;
    readonly threadTs: string;
  }[];
}

// Posts the meeting anchor ("tasks were created in <title>") to the channel,
// then each task card as a reply in the anchor thread. Posts the anchor even
// with zero tasks so every processed recording has a home thread.
export const sendMeetingTasksCreated = ({
  channelId,
  deps,
  meetingTitle,
  tasks,
  workspace,
}: {
  readonly channelId: string;
  readonly deps: MeetingNotificationDeps;
  readonly meetingTitle: string;
  readonly tasks: readonly Task[];
  readonly workspace: Workspace;
}): Promise<MeetingTasksCreatedResult> =>
  withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }): Promise<MeetingTasksCreatedResult> => {
      const anchorTs = await deps.slackGateway.postMessage({
        blocks: buildMeetingTasksRootBlocks({
          language: workspace.language,
          meetingTitle,
          taskCount: tasks.length,
        }),
        botToken,
        channelId,
        text: buildMeetingTasksRootFallbackText({
          language: workspace.language,
          meetingTitle,
          taskCount: tasks.length,
        }),
        unfurlLinks: false,
      });
      const taskMessages = await Promise.all(
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
            threadTs: anchorTs,
            unfurlLinks: false,
          });

          return { messageTs, taskId: task.id, threadTs: anchorTs };
        })
      );

      return { anchorTs, channelId, taskMessages };
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });

// Posts one dependency notice into every given thread target (the meeting
// anchor thread and/or the other task's own thread).
export const sendTaskDependencyNotices = async ({
  blockedTitle,
  blockerTitle,
  deps,
  targets,
  workspace,
}: {
  readonly blockedTitle: string;
  readonly blockerTitle: string;
  readonly deps: MeetingNotificationDeps;
  readonly targets: readonly {
    readonly channelId: string;
    readonly threadTs?: string;
  }[];
  readonly workspace: Workspace;
}): Promise<void> => {
  if (targets.length === 0) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }): Promise<void> => {
      const blocks = buildTaskDependencyNoticeBlocks({
        blockedTitle,
        blockerTitle,
        language: workspace.language,
      });
      const text = buildTaskDependencyNoticeFallbackText({
        blockedTitle,
        blockerTitle,
        language: workspace.language,
      });

      await Promise.all(
        targets.map((target) =>
          deps.slackGateway.postMessage({
            blocks,
            botToken,
            channelId: target.channelId,
            text,
            ...(target.threadTs === undefined
              ? {}
              : { threadTs: target.threadTs }),
            unfurlLinks: false,
          })
        )
      );
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

// Posts a single task card to its channel (used for tasks created directly
// from the web UI, which have no meeting anchor).
export const sendTaskCardToChannel = ({
  channelId,
  deps,
  task,
  workspace,
}: {
  readonly channelId: string;
  readonly deps: MeetingNotificationDeps;
  readonly task: Task;
  readonly workspace: Workspace;
}): Promise<{ readonly messageTs: string }> =>
  withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }): Promise<{ readonly messageTs: string }> => {
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
        unfurlLinks: false,
      });

      return { messageTs };
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
