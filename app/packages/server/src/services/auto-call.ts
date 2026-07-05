import type {
  DeviceTokenRepository,
  NotificationGateway,
  UserProfileRepository,
} from '#server/ports';
import type { CallSessionService } from './call-session-types';
import type { CallTrigger, Workspace } from '@exe/domain';

// Places a server-initiated outbound call (VoIP push → CallKit) to the Exe
// user linked to a Slack member. Used by the blocker trigger (a task started
// blocking 2+ open tasks) and the morning overload check. Best-effort by
// design: no linked user or no device tokens simply means no call.

export interface AutoCallDeps {
  readonly callSessionService: CallSessionService;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly notificationGateway: NotificationGateway;
  readonly userProfileRepository: UserProfileRepository;
}

export const findUserIdForSlackUser = async ({
  slackUserId,
  userProfileRepository,
  workspaceId,
}: {
  readonly slackUserId: string;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceId: string;
}): Promise<string | null> => {
  const profiles = await userProfileRepository.listByWorkspace({ workspaceId });
  const profile = profiles.find((candidate) =>
    candidate.slackUsers.some(
      (linked) =>
        linked.workspaceId === workspaceId && linked.slackUserId === slackUserId
    )
  );

  return profile?.id ?? null;
};

export const startAutoCall = async ({
  deps,
  focusTaskId,
  slackUserId,
  trigger,
  workspace,
}: {
  readonly deps: AutoCallDeps;
  readonly focusTaskId?: string;
  readonly slackUserId: string;
  readonly trigger: CallTrigger;
  readonly workspace: Workspace;
}): Promise<boolean> => {
  const userId = await findUserIdForSlackUser({
    slackUserId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: workspace.id,
  });

  if (userId === null) {
    return false;
  }

  const tokens = await deps.deviceTokenRepository.listByUser({ userId });

  if (tokens.length === 0) {
    return false;
  }

  const { session } = await deps.callSessionService.createOutboundCall({
    ...(focusTaskId === undefined ? {} : { focusTaskId }),
    trigger,
    userId,
    workspaceId: workspace.id,
  });
  const ringingSession = await deps.callSessionService.transitionCall({
    callSessionId: session.id,
    status: 'ringing',
    workspaceId: workspace.id,
  });
  const failedTokens = await deps.notificationGateway.sendIncomingCall({
    session: ringingSession,
    tokens,
    workspace,
  });

  if (failedTokens.length > 0) {
    await deps.deviceTokenRepository.removeByTokens({ tokens: failedTokens });
  }

  return true;
};
