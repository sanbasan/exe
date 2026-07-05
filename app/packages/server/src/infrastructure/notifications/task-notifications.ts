import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import { sendSlackChannelMessage } from './slack';
import {
  isWorkTask,
  type Task,
  type TaskPatch,
  type WorkTask,
  type Workspace,
} from '@exe/domain';
import {
  buildOverdueTaskNotificationBlocks,
  buildOverdueTaskNotificationFallbackText,
  formatSlackDateTime,
  slackMessageUrl,
  slackTaskLinkUrl,
} from '@exe/slack';

interface TaskNotificationDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

const getTaskSlackMessageContext = (
  task: Task
): {
  readonly channelId: string;
  readonly messageTs: string;
  readonly threadTs: string;
} | null => {
  if (
    !isWorkTask(task) ||
    task.channelId === undefined ||
    task.messageTs === undefined
  ) {
    return null;
  }

  return {
    channelId: task.channelId,
    messageTs: task.messageTs,
    threadTs: task.threadTs ?? task.messageTs,
  };
};

const getSlackDomain = ({
  deps,
  workspace,
}: {
  readonly deps: TaskNotificationDeps;
  readonly workspace: Workspace;
}): Promise<string | null> =>
  withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }): Promise<string | null> =>
      deps.slackGateway.getWorkspaceInfo({ botToken }).then((info) => {
        const domain = info?.domain;

        return typeof domain === 'string' && domain.length > 0 ? domain : null;
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });

const getNoDueDateText = (language: Workspace['language']): string =>
  language === 'ja' ? '期限なし' : 'No due date';

const formatDueAtForNotice = ({
  dueAt,
  workspace,
}: {
  readonly dueAt?: string;
  readonly workspace: Workspace;
}): string =>
  dueAt === undefined
    ? getNoDueDateText(workspace.language)
    : formatSlackDateTime({
        isoDateTime: dueAt,
        language: workspace.language,
        timezone: workspace.timezone,
      });

const formatTaskTitleLink = ({
  title,
  url,
}: {
  readonly title: string;
  readonly url: string;
}): string => `<${url}|*${title}*>`;

const getTaskPatchThreadNoticeText = ({
  afterDueAt,
  beforeDueAt,
  task,
  taskUrl,
  workspace,
}: {
  readonly afterDueAt?: string;
  readonly beforeDueAt?: string;
  readonly task: WorkTask;
  readonly taskUrl: string;
  readonly workspace: Workspace;
}): string => {
  const before = formatDueAtForNotice({
    ...(beforeDueAt === undefined ? {} : { dueAt: beforeDueAt }),
    workspace,
  });
  const after = formatDueAtForNotice({
    ...(afterDueAt === undefined ? {} : { dueAt: afterDueAt }),
    workspace,
  });
  const dueAtText = `${before} → ${after}`;
  const taskLink = formatTaskTitleLink({ title: task.title, url: taskUrl });

  return workspace.language === 'ja'
    ? `:memo: ${taskLink} の期限を変更しました\n*期限:* ${dueAtText}`
    : `:memo: Updated the due date for ${taskLink}\n*Due:* ${dueAtText}`;
};

export const sendOverdueTaskNotification = async ({
  deps,
  task,
  workspace,
}: {
  readonly deps: TaskNotificationDeps;
  readonly task: Task;
  readonly workspace: Workspace;
}): Promise<{
  readonly channelId: string;
  readonly messageTs: string;
  readonly threadTs: string;
} | null> => {
  if (!isWorkTask(task) || task.dueAt === undefined) {
    return null;
  }

  const context = getTaskSlackMessageContext(task);

  if (context === null) {
    return null;
  }

  const slackDomain = await getSlackDomain({ deps, workspace });

  if (slackDomain === null) {
    return null;
  }

  const taskUrl = slackMessageUrl({
    channelId: context.channelId,
    messageTs: context.messageTs,
    slackDomain,
    threadTs: context.threadTs,
  });
  const text = buildOverdueTaskNotificationFallbackText({
    language: workspace.language,
    taskUrl,
    title: task.title,
  });
  const messageTs = await sendSlackChannelMessage({
    blocks: buildOverdueTaskNotificationBlocks({
      assigneeSlackUserIds: task.assigneeSlackUserIds,
      dueAt: task.dueAt,
      language: workspace.language,
      taskId: task.id,
      taskUrl,
      timezone: workspace.timezone,
      title: task.title,
    }),
    channelId: context.channelId,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    slackGateway: deps.slackGateway,
    text,
    threadTs: context.threadTs,
    unfurlLinks: false,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });

  return {
    channelId: context.channelId,
    messageTs,
    threadTs: context.threadTs,
  };
};

export const sendTaskPatchThreadNotice = async (params: {
  readonly deps: TaskNotificationDeps;
  readonly patch: TaskPatch;
  readonly previousTask: Task;
  readonly task: Task;
  readonly workspace: Workspace;
}): Promise<void> => {
  const { deps, previousTask, task, workspace } = params;

  if (
    !isWorkTask(previousTask) ||
    !isWorkTask(task) ||
    previousTask.dueAt === task.dueAt
  ) {
    return;
  }

  const context = getTaskSlackMessageContext(task);

  if (context === null) {
    return;
  }

  const slackDomain = (await getSlackDomain({ deps, workspace })) ?? '';
  const taskUrl = slackTaskLinkUrl({ slackDomain, task });

  if (taskUrl === null) {
    return;
  }

  const text = getTaskPatchThreadNoticeText({
    ...(task.dueAt === undefined ? {} : { afterDueAt: task.dueAt }),
    ...(previousTask.dueAt === undefined
      ? {}
      : { beforeDueAt: previousTask.dueAt }),
    task,
    taskUrl,
    workspace,
  });

  await sendSlackChannelMessage({
    blocks: [
      {
        text: {
          text,
          type: 'mrkdwn',
        },
        type: 'section',
      },
    ],
    channelId: context.channelId,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    slackGateway: deps.slackGateway,
    text,
    threadTs: context.threadTs,
    unfurlLinks: false,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
