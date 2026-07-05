import { invalidRequestError, notFoundError } from '#server/errors';
import type { ChannelRepository, WorkspaceRepository } from '#server/ports';
import { assertCanAccessChannel } from './channel-access';
import type { ChannelVisibilityService } from './channel-visibility-service';
import { isFarOutNextCheck, type Channel, type Workspace } from '@exe/domain';

// Re-exported for existing import sites; the implementation now lives in the
// domain package (see @exe/domain channel-review).
export { isFarOutNextCheck } from '@exe/domain';

export const assertNextCheckReasonWhenFarOut = ({
  nextCheckAt,
  nextCheckReason,
  now,
}: {
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly now: string;
}): void => {
  if (
    nextCheckAt !== undefined &&
    isFarOutNextCheck({ from: now, nextCheckAt }) &&
    (nextCheckReason === undefined || nextCheckReason.trim().length === 0)
  ) {
    throw invalidRequestError(
      'A next check 8 or more days out requires a reason (nextCheckReason).'
    );
  }
};

export const getAccessibleChannelAndWorkspace = async ({
  channelId,
  channelRepository,
  channelVisibility,
  slackUserId,
  workspaceId,
  workspaceRepository,
}: {
  readonly channelId: string;
  readonly channelRepository: ChannelRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly slackUserId: string;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<{ readonly channel: Channel; readonly workspace: Workspace }> => {
  const [channel, workspace] = await Promise.all([
    channelRepository.getById({ channelId, workspaceId }),
    workspaceRepository.getById({ workspaceId }),
  ]);

  if (channel === null) {
    throw notFoundError(`Channel ${channelId} was not found.`);
  }

  if (workspace === null) {
    throw notFoundError(`Workspace ${workspaceId} was not found.`);
  }

  const visibility = await channelVisibility.getVisibilityForSlackUser({
    slackUserId,
    workspace,
  });

  assertCanAccessChannel({ channel, visibility });

  return { channel, workspace };
};
