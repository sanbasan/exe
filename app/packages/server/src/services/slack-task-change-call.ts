import type {
  DeviceTokenRepository,
  NotificationGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import type { CallSessionService } from './call-session-service';
import {
  canManageWorkspaceSettings,
  isWorkTask,
  type Task,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import { slackActionIds } from '@exe/slack';

interface SlackTaskChangeCallDeps {
  readonly callSessionService: CallSessionService;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly notificationGateway: NotificationGateway;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

const findUserProfileBySlackUserId = async ({
  slackTeamId,
  slackUserId,
  userProfileRepository,
}: {
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly userProfileRepository: UserProfileRepository;
}): Promise<UserProfile | null> => {
  const profiles = await userProfileRepository.listByWorkspace({
    workspaceId: slackTeamId,
  });

  return (
    profiles.find((profile) =>
      profile.slackUsers.some(
        (link) =>
          link.workspaceId === slackTeamId && link.slackUserId === slackUserId
      )
    ) ?? null
  );
};

const canDiscussTask = ({
  slackUserId,
  task,
  workspace,
}: {
  readonly slackUserId: string;
  readonly task: Task;
  readonly workspace: Workspace;
}): boolean =>
  task.assigneeSlackUserIds.includes(slackUserId) ||
  task.requesterSlackUserIds.includes(slackUserId) ||
  canManageWorkspaceSettings({ slackUserId, workspace });

export const handleSlackTaskChangeCallAction = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  value,
}: {
  readonly actionId: string;
  readonly deps: SlackTaskChangeCallDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly value?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.startTaskChangeCall || value === undefined) {
    return;
  }

  const [workspace, task, userProfile] = await Promise.all([
    deps.workspaceRepository.getById({ workspaceId: slackTeamId }),
    deps.taskRepository.getById({ taskId: value, workspaceId: slackTeamId }),
    findUserProfileBySlackUserId({
      slackTeamId,
      slackUserId,
      userProfileRepository: deps.userProfileRepository,
    }),
  ]);

  if (
    workspace === null ||
    task === null ||
    userProfile === null ||
    !isWorkTask(task) ||
    !canDiscussTask({ slackUserId, task, workspace })
  ) {
    return;
  }

  const { session } = await deps.callSessionService.createManualReviewCall({
    focusTaskId: task.id,
    mode: 'manual_review',
    userId: userProfile.id,
    workspaceId: workspace.id,
  });
  const ringingSession =
    session.status === 'created'
      ? await deps.callSessionService.transitionCall({
          callSessionId: session.id,
          status: 'ringing',
          workspaceId: session.workspaceId,
        })
      : session;
  const tokens = await deps.deviceTokenRepository.listByUser({
    userId: userProfile.id,
  });
  const failedTokens = await deps.notificationGateway.sendIncomingCall({
    session: ringingSession,
    tokens,
    workspace,
  });

  await deps.deviceTokenRepository.removeByTokens({ tokens: failedTokens });
};
