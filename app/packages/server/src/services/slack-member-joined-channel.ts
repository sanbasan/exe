import type {
  ChannelRepository,
  Clock,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { ensureSlackChannelWithOptionalOwner } from './slack-channel';

export interface SlackMemberJoinedChannelDeps {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

export const handleSlackMemberJoinedChannel = async ({
  channelId,
  deps,
  inviterSlackUserId,
  slackTeamId,
  slackUserId,
}: {
  readonly channelId: string;
  readonly deps: SlackMemberJoinedChannelDeps;
  readonly inviterSlackUserId?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<void> => {
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace?.botUserId !== slackUserId) {
    return;
  }

  const initialOwnerSlackUserId =
    inviterSlackUserId === undefined ||
    inviterSlackUserId === workspace.botUserId
      ? undefined
      : inviterSlackUserId;

  await ensureSlackChannelWithOptionalOwner({
    channelId,
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    ...(initialOwnerSlackUserId === undefined
      ? {}
      : { initialOwnerSlackUserId }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
