import type {
  Clock,
  ChannelEventRepository,
  ChannelRepository,
  IdGenerator,
  SlackGateway,
  TaskRepository,
  WorkspaceRepository,
} from '#server/ports';
import { buildWorkspaceAppUrl } from './app-links';
import { syncChannelAssigneesForTaskBestEffort } from './channel-assignee-sync';
import { withSlackBotToken } from './slack-bot-token';
import { ensureSlackChannel } from './slack-channel';
import type { SlackUserMessageInput } from './slack-service';
import { buildSlackTaskFromMessages } from './slack-task-creation';
import { buildSlackTaskMessageBlocks } from './slack-task-message-blocks';
import { buildChannelEventForTask, buildSlackTaskId } from './slack-task-utils';
import { hasWorkspaceAdmins, workTaskSchema } from '@exe/domain';
import { buildAdminSetupRequiredMessage } from '@exe/slack';

const toEncryptionKeyParams = (
  encryptionKey?: string
): {
  readonly encryptionKey?: string;
} => (encryptionKey === undefined ? {} : { encryptionKey });

export const isSlackTaskCreationDmChannel = ({
  channelId,
  channelType,
}: {
  readonly channelId: string;
  readonly channelType?: string;
}): boolean => channelType === 'im' || channelId.startsWith('D');

export const shouldHandleSlackTaskCreationTrigger = ({
  params,
}: {
  readonly params: SlackUserMessageInput;
}): boolean => {
  if (params.botId !== undefined || params.subtype !== undefined) {
    return false;
  }

  if (params.type === 'app_mention') {
    return !isSlackTaskCreationDmChannel({
      channelId: params.channelId,
      ...(params.channelType === undefined
        ? {}
        : { channelType: params.channelType }),
    });
  }

  if (
    !isSlackTaskCreationDmChannel({
      channelId: params.channelId,
      ...(params.channelType === undefined
        ? {}
        : { channelType: params.channelType }),
    })
  ) {
    return false;
  }

  return params.threadTs === undefined;
};

export const getSlackTaskCreationReplyThreadTs = ({
  messageTs,
  threadTs,
}: {
  readonly messageTs: string;
  readonly threadTs?: string;
}): string => threadTs ?? messageTs;

export const getSlackTaskCreationSourceMessageTs = ({
  messageTs,
  threadTs,
}: {
  readonly messageTs: string;
  readonly threadTs?: string;
}): string => threadTs ?? messageTs;

export const handleSlackUserMessage = async ({
  appUrl,
  channelEventRepository,
  channelRepository,
  clock,
  encryptionKey,
  idGenerator,
  params,
  slackGateway,
  taskRepository,
  workspaceRepository,
}: {
  readonly appUrl: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly idGenerator: IdGenerator;
  readonly params: SlackUserMessageInput;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelRepository: ChannelRepository;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<void> => {
  if (!shouldHandleSlackTaskCreationTrigger({ params })) {
    return;
  }

  const workspace = await workspaceRepository.getById({
    workspaceId: params.slackTeamId,
  });

  if (workspace === null || params.slackUserId === workspace.botUserId) {
    return;
  }

  const replyThreadTs = getSlackTaskCreationReplyThreadTs({
    messageTs: params.messageTs,
    ...(params.threadTs === undefined ? {} : { threadTs: params.threadTs }),
  });

  if (!hasWorkspaceAdmins(workspace)) {
    const { blocks, text } = buildAdminSetupRequiredMessage({
      appUrl: buildWorkspaceAppUrl({
        appUrl,
        workspaceId: workspace.id,
      }),
      language: workspace.language,
      userId: params.slackUserId,
    });

    await withSlackBotToken({
      clock,
      ...toEncryptionKeyParams(encryptionKey),
      run: ({ botToken }) =>
        slackGateway.postMessage({
          blocks,
          botToken,
          channelId: params.channelId,
          text,
          threadTs: replyThreadTs,
        }),
      slackGateway,
      workspace,
      workspaceRepository,
    });

    return;
  }

  const sourceMessageTs = getSlackTaskCreationSourceMessageTs({
    messageTs: params.messageTs,
    ...(params.threadTs === undefined ? {} : { threadTs: params.threadTs }),
  });
  const taskId = buildSlackTaskId({
    channelId: params.channelId,
    messageTs: sourceMessageTs,
  });
  const existingTask = await taskRepository.getById({
    taskId,
    workspaceId: workspace.id,
  });

  if (existingTask !== null) {
    return;
  }

  const isDm = isSlackTaskCreationDmChannel({
    channelId: params.channelId,
    ...(params.channelType === undefined
      ? {}
      : { channelType: params.channelType }),
  });
  const channel = isDm
    ? null
    : await ensureSlackChannel({
        channelId: params.channelId,
        channelRepository,
        clock,
        ...toEncryptionKeyParams(encryptionKey),
        slackGateway,
        slackUserId: params.slackUserId,
        workspace,
        workspaceRepository,
      });
  const task = await withSlackBotToken({
    clock,
    ...toEncryptionKeyParams(encryptionKey),
    run: ({ botToken }) =>
      buildSlackTaskFromMessages({
        botToken,
        channelId: params.channelId,
        clock,
        ...(params.files === undefined ? {} : { files: params.files }),
        messageTs: params.messageTs,
        slackGateway,
        slackUserId: params.slackUserId,
        taskId,
        text: params.text,
        ...(params.threadTs === undefined ? {} : { threadTs: params.threadTs }),
        workspace,
      }),
    slackGateway,
    workspace,
    workspaceRepository,
  });

  if (task === null) {
    if (params.type === 'app_mention') {
      await withSlackBotToken({
        clock,
        ...toEncryptionKeyParams(encryptionKey),
        run: ({ botToken }) =>
          slackGateway.postMessage({
            blocks: [],
            botToken,
            channelId: params.channelId,
            text: "I couldn't create a task from that message. Please try again.",
            threadTs: replyThreadTs,
          }),
        slackGateway,
        workspace,
        workspaceRepository,
      });
    }

    return;
  }

  await taskRepository.create({ task });
  await syncChannelAssigneesForTaskBestEffort({
    channelRepository,
    clock,
    task,
  });

  const now = clock.now();
  const channelEvent =
    channel === null
      ? null
      : buildChannelEventForTask({
          id: idGenerator.generateId(),
          language: workspace.language,
          now,
          task,
        });

  if (channelEvent !== null) {
    await channelEventRepository.create({ event: channelEvent });
  }

  const messageTs = await withSlackBotToken({
    clock,
    ...toEncryptionKeyParams(encryptionKey),
    run: async ({ botToken }) =>
      slackGateway.postMessage({
        blocks: await buildSlackTaskMessageBlocks({
          botToken,
          language: workspace.language,
          slackGateway,
          task,
          timezone: workspace.timezone,
        }),
        botToken,
        channelId: params.channelId,
        text: task.title,
        threadTs: replyThreadTs,
      }),
    slackGateway,
    workspace,
    workspaceRepository,
  });

  await taskRepository.update({
    task: workTaskSchema.parse({
      ...task,
      messageTs,
      threadTs: replyThreadTs,
      updatedAt: clock.now(),
    }),
  });
};
