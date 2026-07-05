import type {
  ChannelRepository,
  Clock,
  SlackGateway,
  TaskRepository,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import {
  canEditChannelOwners,
  channelSchema,
  isWorkTask,
  type Workspace,
} from '@exe/domain';
import {
  buildChannelSettingsModal,
  parseChannelSettingsAssignees,
  parseChannelSettingsPrivateMetadata,
  parseTaskOverflowActionValue,
  slackActionIds,
  slackViewIds,
  taskOverflowActions,
} from '@exe/slack';

interface SlackChannelSettingsDeps {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

const getChannelIdFromAction = ({
  actionId,
  selectedOptionValue,
  value,
}: {
  readonly actionId?: string;
  readonly selectedOptionValue?: string;
  readonly value?: string;
}): { readonly channelId: string } | { readonly taskId: string } | null => {
  if (actionId === slackActionIds.openChannelSettings && value !== undefined) {
    return { channelId: value };
  }

  if (selectedOptionValue === undefined) {
    return null;
  }

  const parsed = parseTaskOverflowActionValue(selectedOptionValue);

  return parsed?.action === taskOverflowActions.channelSettings
    ? { taskId: parsed.taskId }
    : null;
};

const resolveChannelId = async ({
  deps,
  target,
  workspaceId,
}: {
  readonly deps: SlackChannelSettingsDeps;
  readonly target: { readonly channelId: string } | { readonly taskId: string };
  readonly workspaceId: string;
}): Promise<string | null> => {
  if ('channelId' in target) {
    return target.channelId;
  }

  const task = await deps.taskRepository.getById({
    taskId: target.taskId,
    workspaceId,
  });

  return task !== null && isWorkTask(task) ? (task.channelId ?? null) : null;
};

const canEdit = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean => canEditChannelOwners({ slackUserId, workspace });

export const openSlackChannelSettings = async ({
  actionId,
  deps,
  selectedOptionValue,
  slackTeamId,
  slackUserId,
  triggerId,
  value,
}: {
  readonly actionId?: string;
  readonly deps: SlackChannelSettingsDeps;
  readonly selectedOptionValue?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
  readonly value?: string;
}): Promise<void> => {
  const target = getChannelIdFromAction({
    ...(actionId === undefined ? {} : { actionId }),
    ...(selectedOptionValue === undefined ? {} : { selectedOptionValue }),
    ...(value === undefined ? {} : { value }),
  });

  if (triggerId === undefined || target === null) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  const channelId = await resolveChannelId({
    deps,
    target,
    workspaceId: workspace.id,
  });

  if (channelId === null) {
    return;
  }

  const channel = await deps.channelRepository.getById({
    channelId,
    workspaceId: workspace.id,
  });

  if (channel === null || !canEdit({ slackUserId, workspace })) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildChannelSettingsModal({
          channel,
          language: workspace.language,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const saveSlackChannelSettings = async ({
  callbackId,
  deps,
  privateMetadata,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackChannelSettingsDeps;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.channelSettings) {
    return;
  }

  const channelId = parseChannelSettingsPrivateMetadata({
    ...(privateMetadata === undefined ? {} : { privateMetadata }),
  });
  const assignees = parseChannelSettingsAssignees(stateValues);

  if (channelId === null || assignees === null) {
    return;
  }

  const [workspace, channel] = await Promise.all([
    deps.workspaceRepository.getById({ workspaceId: slackTeamId }),
    deps.channelRepository.getById({ channelId, workspaceId: slackTeamId }),
  ]);

  if (
    workspace === null ||
    channel === null ||
    !canEdit({ slackUserId, workspace })
  ) {
    return;
  }

  await deps.channelRepository.upsert({
    channel: channelSchema.parse({
      ...channel,
      assigneeSlackUserIds: [...new Set(assignees)],
      updatedAt: deps.clock.now(),
    }),
  });
};
