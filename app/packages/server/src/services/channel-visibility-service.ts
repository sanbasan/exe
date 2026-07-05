import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import type { ChannelVisibility } from './channel-access';
import { withSlackBotToken } from './slack-bot-token';
import { canManageWorkspaceSettings, type Workspace } from '@exe/domain';

export interface ChannelVisibilityServiceDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

export interface ChannelVisibilityService {
  readonly getVisibilityForSlackUser: (params: {
    readonly slackUserId: string;
    readonly workspace: Workspace;
  }) => Promise<ChannelVisibility>;
}

const isGuestUserInfoStatus = (status: string): boolean =>
  status === 'is_restricted' || status === 'is_ultra_restricted';

const isInvisibleUserInfoStatus = (status: string): boolean =>
  status === 'is_bot' ||
  status === 'is_deleted' ||
  status === 'is_stranger' ||
  status === 'user_not_found';

const resolveVisibility = async ({
  deps,
  slackUserId,
  workspace,
}: {
  readonly deps: ChannelVisibilityServiceDeps;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): Promise<ChannelVisibility> => {
  const [conversations, userInfo] = await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      Promise.all([
        deps.slackGateway.listUserJoinedChannelIds({ botToken, slackUserId }),
        deps.slackGateway.getUserInfo({ botToken, slackUserId }),
      ]),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });

  // Never fail open on a transient Slack/API error: an indeterminate result
  // must not be silently treated as "no access" or "full access".
  if (
    conversations.status === 'indeterminate' ||
    userInfo.status === 'indeterminate'
  ) {
    throw new Error('Slack channel visibility could not be resolved.');
  }

  if (conversations.status === 'user_not_found') {
    return { isGuest: true, joinedChannelIds: new Set() };
  }

  const joinedChannelIds = new Set(conversations.channelIds);

  if (isInvisibleUserInfoStatus(userInfo.status)) {
    return { isGuest: true, joinedChannelIds: new Set() };
  }

  return {
    isGuest: isGuestUserInfoStatus(userInfo.status),
    joinedChannelIds,
  };
};

// Every call resolves visibility live from Slack; nothing is cached or
// memoized, so revocations take effect on the very next request. Parallel
// requests for the same user each make their own Slack round trip, which is
// well within users.conversations rate limits at this product's scale.
export const createChannelVisibilityService = (
  deps: ChannelVisibilityServiceDeps
): ChannelVisibilityService => ({
  getVisibilityForSlackUser: ({
    slackUserId,
    workspace,
  }: {
    readonly slackUserId: string;
    readonly workspace: Workspace;
  }): Promise<ChannelVisibility> =>
    canManageWorkspaceSettings({ slackUserId, workspace })
      ? Promise.resolve('all')
      : resolveVisibility({ deps, slackUserId, workspace }),
});
