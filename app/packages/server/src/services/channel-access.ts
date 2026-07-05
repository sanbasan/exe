import { forbiddenError } from '#server/errors';
import {
  canAccessChannel,
  canEditChannelMetadata,
  type Channel,
  type ChannelVisibilityContext,
  type Workspace,
} from '@exe/domain';

// 'all' bypasses per-user Slack channel visibility entirely. It is returned
// by ChannelVisibilityService for workspace admins only (see
// channel-visibility-service.ts), since resolving admin visibility must never
// require a live Slack call. Every other caller resolves a real
// ChannelVisibilityContext for the current Slack user and enforces it here.
export type ChannelVisibility = 'all' | ChannelVisibilityContext;

export const assertCanAccessChannel = ({
  channel,
  visibility,
}: {
  readonly channel: Channel;
  readonly visibility: ChannelVisibility;
}): void => {
  const allowed =
    visibility === 'all' || canAccessChannel({ channel, visibility });

  if (!allowed) {
    throw forbiddenError(
      `Channel ${channel.channelId} is not accessible to this user.`
    );
  }
};

export const assertCanEditChannelMetadata = ({
  channel,
  slackUserId,
  workspace,
}: {
  readonly channel: Channel;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): void => {
  if (!canEditChannelMetadata({ channel, slackUserId, workspace })) {
    throw forbiddenError(
      `Slack user ${slackUserId} cannot edit channel ${channel.channelId}.`
    );
  }
};

export const listChannelsVisibleToSlackUser = ({
  channels,
  visibility,
}: {
  readonly channels: readonly Channel[];
  readonly visibility: ChannelVisibility;
}): readonly Channel[] =>
  visibility === 'all'
    ? channels
    : channels.filter((channel) => canAccessChannel({ channel, visibility }));
