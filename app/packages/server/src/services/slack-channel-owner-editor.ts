import type {
  ChannelRepository,
  Clock,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { syncSlackChannelInfo } from './slack-channel';
import {
  canEditChannelOwners,
  channelSchema,
  type Channel,
  type Workspace,
} from '@exe/domain';
import {
  buildChannelOwnerEditorModal,
  parseChannelOwnerEditorAssignees,
  parseChannelOwnerEditorPrivateMetadata,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

interface SlackChannelOwnerEditorDeps {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

const canEdit = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean => canEditChannelOwners({ slackUserId, workspace });

const isSlackViewHashConflictError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'data' in error &&
  typeof error.data === 'object' &&
  error.data !== null &&
  'error' in error.data &&
  error.data.error === 'hash_conflict';

const isActiveEditableChannel = ({
  channel,
  slackUserId,
  workspace,
}: {
  readonly channel: Channel;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean =>
  channel.status === 'active' && canEdit({ slackUserId, workspace });

const listEditableChannels = async ({
  deps,
  slackUserId,
  workspace,
}: {
  readonly deps: SlackChannelOwnerEditorDeps;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): Promise<readonly Channel[]> => {
  const channels = await deps.channelRepository.listByWorkspace({
    workspaceId: workspace.id,
  });

  return channels.filter((channel) =>
    isActiveEditableChannel({ channel, slackUserId, workspace })
  );
};

const isBotJoinedEditableSlackChannel = ({
  isArchived,
  isIm,
  isMember,
  isMpim,
}: {
  readonly isArchived?: boolean;
  readonly isIm: boolean;
  readonly isMember?: boolean;
  readonly isMpim?: boolean;
}): boolean =>
  isMember === true && isArchived !== true && !isIm && isMpim !== true;

const syncBotJoinedSlackChannels = async ({
  deps,
  workspace,
}: {
  readonly deps: SlackChannelOwnerEditorDeps;
  readonly workspace: Workspace;
}): Promise<void> => {
  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }) => {
      const channels = await deps.slackGateway.listBotJoinedChannels({
        botToken,
      });

      await Promise.all(
        channels.filter(isBotJoinedEditableSlackChannel).map((channelInfo) =>
          syncSlackChannelInfo({
            channelInfo,
            channelRepository: deps.channelRepository,
            clock: deps.clock,
            slackGateway: deps.slackGateway,
            workspace,
            workspaceRepository: deps.workspaceRepository,
          })
        )
      );
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const openSlackChannelOwnerEditor = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackChannelOwnerEditorDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.openChannelOwnerEditor ||
    triggerId === undefined
  ) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  if (!canEdit({ slackUserId, workspace })) {
    return;
  }

  await syncBotJoinedSlackChannels({ deps, workspace }).catch(() => null);

  const channels = await listEditableChannels({ deps, slackUserId, workspace });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildChannelOwnerEditorModal({
          channels,
          language: workspace.language,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const updateSlackChannelOwnerEditor = async ({
  actionId,
  deps,
  selectedOptionValue,
  slackTeamId,
  slackUserId,
  viewHash,
  viewId,
}: {
  readonly actionId: string;
  readonly deps: SlackChannelOwnerEditorDeps;
  readonly selectedOptionValue?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly viewHash?: string;
  readonly viewId?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.channelOwnerEditorChannel ||
    selectedOptionValue === undefined ||
    viewId === undefined
  ) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  const channels = await listEditableChannels({ deps, slackUserId, workspace });
  const selectedChannel = channels.find(
    (channel) => channel.channelId === selectedOptionValue
  );

  if (selectedChannel === undefined) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway
        .updateView({
          botToken,
          ...(viewHash === undefined ? {} : { hash: viewHash }),
          view: buildChannelOwnerEditorModal({
            channels,
            language: workspace.language,
            selectedChannel,
          }),
          viewId,
        })
        .catch((error: unknown): void => {
          if (!isSlackViewHashConflictError(error)) {
            throw error;
          }
        }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const saveSlackChannelOwnerEditor = async ({
  callbackId,
  deps,
  privateMetadata,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackChannelOwnerEditorDeps;
  readonly privateMetadata?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.channelOwnerEditor) {
    return;
  }

  const channelId = parseChannelOwnerEditorPrivateMetadata({
    ...(privateMetadata === undefined ? {} : { privateMetadata }),
  });
  const assignees = parseChannelOwnerEditorAssignees(stateValues);

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
