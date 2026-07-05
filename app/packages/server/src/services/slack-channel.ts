import type {
  ChannelRepository,
  Clock,
  SlackChannelInfo,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { channelSchema, type Channel, type Workspace } from '@exe/domain';

interface SlackChannelDetails {
  readonly isPrivate?: boolean;
  readonly name: string;
}

const getSlackChannelDetails = async ({
  channelId,
  clock,
  encryptionKey,
  slackGateway,
  workspace,
  workspaceRepository,
}: {
  readonly channelId: string;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<SlackChannelDetails> => {
  const channel = await withSlackBotToken({
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    run: ({ botToken }) =>
      slackGateway.getChannelInfo({
        botToken,
        channelId,
      }),
    slackGateway,
    workspace,
    workspaceRepository,
  }).catch(() => null);

  return {
    ...(channel?.isPrivate === undefined
      ? {}
      : { isPrivate: channel.isPrivate }),
    name: channel?.name ?? channelId,
  };
};

const buildSlackChannel = ({
  channelId,
  existingChannel,
  initialOwnerSlackUserId,
  isPrivate,
  name,
  now,
  workspace,
}: {
  readonly channelId: string;
  readonly existingChannel: Channel | null;
  readonly initialOwnerSlackUserId?: string;
  readonly isPrivate?: boolean;
  readonly name: string;
  readonly now: string;
  readonly workspace: Workspace;
}): Channel => {
  const initialAssignees =
    initialOwnerSlackUserId === undefined ? [] : [initialOwnerSlackUserId];

  return channelSchema.parse({
    ...(existingChannel ?? {}),
    assigneeSlackUserIds:
      existingChannel === null
        ? initialAssignees
        : [...new Set(existingChannel.assigneeSlackUserIds)],
    channelId,
    createdAt: existingChannel?.createdAt ?? now,
    createdBySlackUserId:
      existingChannel?.createdBySlackUserId ??
      initialOwnerSlackUserId ??
      workspace.botUserId,
    ...(isPrivate === undefined ? {} : { isPrivate }),
    name,
    status: 'active',
    updatedAt: now,
    watcherSlackUserIds: existingChannel?.watcherSlackUserIds ?? [],
    workspaceId: workspace.id,
  });
};

export const ensureSlackChannel = ({
  channelId,
  channelRepository,
  clock,
  encryptionKey,
  slackGateway,
  slackUserId,
  workspace,
  workspaceRepository,
}: {
  readonly channelId: string;
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<Channel> =>
  ensureSlackChannelWithOptionalOwner({
    channelId,
    channelRepository,
    clock,
    ...(encryptionKey === undefined ? {} : { encryptionKey }),
    initialOwnerSlackUserId: slackUserId,
    slackGateway,
    workspace,
    workspaceRepository,
  });

export const ensureSlackChannelWithOptionalOwner = async ({
  channelId,
  channelRepository,
  clock,
  encryptionKey,
  initialOwnerSlackUserId,
  isPrivate: providedIsPrivate,
  name: providedName,
  slackGateway,
  workspace,
  workspaceRepository,
}: {
  readonly channelId: string;
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly initialOwnerSlackUserId?: string;
  readonly isPrivate?: boolean;
  readonly name?: string;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<Channel> => {
  const [existingChannel, channelDetails] = await Promise.all([
    channelRepository.getById({ channelId, workspaceId: workspace.id }),
    providedName === undefined
      ? getSlackChannelDetails({
          channelId,
          clock,
          ...(encryptionKey === undefined ? {} : { encryptionKey }),
          slackGateway,
          workspace,
          workspaceRepository,
        })
      : Promise.resolve({
          ...(providedIsPrivate === undefined
            ? {}
            : { isPrivate: providedIsPrivate }),
          name: providedName,
        }),
  ]);
  const channel = buildSlackChannel({
    channelId,
    existingChannel,
    ...(initialOwnerSlackUserId === undefined
      ? {}
      : { initialOwnerSlackUserId }),
    ...(channelDetails.isPrivate === undefined
      ? {}
      : { isPrivate: channelDetails.isPrivate }),
    name: channelDetails.name,
    now: clock.now(),
    workspace,
  });

  await channelRepository.upsert({ channel });

  return channel;
};

export const syncSlackChannelInfo = ({
  channelInfo,
  channelRepository,
  clock,
  initialOwnerSlackUserId,
  slackGateway,
  workspace,
  workspaceRepository,
}: {
  readonly channelInfo: SlackChannelInfo;
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly initialOwnerSlackUserId?: string;
  readonly slackGateway: SlackGateway;
  readonly workspace: Workspace;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<Channel> =>
  ensureSlackChannelWithOptionalOwner({
    channelId: channelInfo.id,
    channelRepository,
    clock,
    ...(initialOwnerSlackUserId === undefined
      ? {}
      : { initialOwnerSlackUserId }),
    ...(channelInfo.isPrivate === undefined
      ? {}
      : { isPrivate: channelInfo.isPrivate }),
    name: channelInfo.name,
    slackGateway,
    workspace,
    workspaceRepository,
  });
