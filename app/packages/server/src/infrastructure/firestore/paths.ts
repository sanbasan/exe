export const workspaceCollectionPath = 'workspaces';

export const workspaceDocumentPath = (workspaceId: string): string =>
  `${workspaceCollectionPath}/${workspaceId}`;

export const workspaceSlackTokenLockCollectionPath =
  'workspace_slack_token_locks_v1';

export const workspaceSlackTokenLockDocumentPath = (
  workspaceId: string
): string => `${workspaceSlackTokenLockCollectionPath}/${workspaceId}`;

export const userProfileCollectionPath = 'user_profiles';

export const userProfileDocumentPath = (userId: string): string =>
  `${userProfileCollectionPath}/${userId}`;

export const slackMemberIndexCollectionPath = 'slack_member_index';

export const slackMemberIndexDocumentId = ({
  slackUserId,
  workspaceId,
}: {
  readonly slackUserId: string;
  readonly workspaceId: string;
}): string => `${workspaceId}:${slackUserId}`;

export const slackMemberIndexDocumentPath = (params: {
  readonly slackUserId: string;
  readonly workspaceId: string;
}): string =>
  `${slackMemberIndexCollectionPath}/${slackMemberIndexDocumentId(params)}`;

export const deviceTokenCollectionPath = 'device_tokens';

export const deviceTokenDocumentPath = (deviceTokenId: string): string =>
  `${deviceTokenCollectionPath}/${deviceTokenId}`;

export const signInCodeCollectionPath = 'sign_in_codes_v1';

export const signInCodeDocumentPath = (signInCodeId: string): string =>
  `${signInCodeCollectionPath}/${signInCodeId}`;

export const callEventCollectionId = 'call_events';

export const callEventCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${callEventCollectionId}`;

export const callNotificationCollectionId = 'call_notifications';

export const callNotificationCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${callNotificationCollectionId}`;

export const callScheduleCollectionId = 'call_schedules';

export const callScheduleCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${callScheduleCollectionId}`;

export const callScheduleDocumentPath = ({
  callScheduleId,
  workspaceId,
}: {
  readonly callScheduleId: string;
  readonly workspaceId: string;
}): string => `${callScheduleCollectionPath(workspaceId)}/${callScheduleId}`;

export const callSessionCollectionId = 'call_sessions';

export const callSessionCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${callSessionCollectionId}`;

export const callSessionDocumentPath = ({
  callSessionId,
  workspaceId,
}: {
  readonly callSessionId: string;
  readonly workspaceId: string;
}): string => `${callSessionCollectionPath(workspaceId)}/${callSessionId}`;

export const channelCollectionId = 'channels';

export const channelCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${channelCollectionId}`;

export const channelDocumentPath = ({
  channelId,
  workspaceId,
}: {
  readonly channelId: string;
  readonly workspaceId: string;
}): string => `${channelCollectionPath(workspaceId)}/${channelId}`;

export const channelEventCollectionId = 'channel_events';

export const channelEventCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${channelEventCollectionId}`;

export const channelBlockCollectionId = 'channel_blocks';

export const channelBlockCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${channelBlockCollectionId}`;

export const channelBlockDocumentPath = ({
  blockId,
  workspaceId,
}: {
  readonly blockId: string;
  readonly workspaceId: string;
}): string => `${channelBlockCollectionPath(workspaceId)}/${blockId}`;

export const channelReviewStateCollectionId = 'channel_review_states';

export const channelReviewStateCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${channelReviewStateCollectionId}`;

export const channelReviewStateDocumentPath = ({
  stateId,
  workspaceId,
}: {
  readonly stateId: string;
  readonly workspaceId: string;
}): string => `${channelReviewStateCollectionPath(workspaceId)}/${stateId}`;

export const taskCollectionId = 'tasks';

export const taskCollectionPath = (workspaceId: string): string =>
  `${workspaceDocumentPath(workspaceId)}/${taskCollectionId}`;

export const taskDocumentPath = ({
  taskId,
  workspaceId,
}: {
  readonly taskId: string;
  readonly workspaceId: string;
}): string => `${taskCollectionPath(workspaceId)}/${taskId}`;

export const overdueTaskNotificationCollectionId = 'overdue_task_notifications';

export const overdueTaskNotificationCollectionPath = ({
  taskId,
  workspaceId,
}: {
  readonly taskId: string;
  readonly workspaceId: string;
}): string =>
  `${taskDocumentPath({
    taskId,
    workspaceId,
  })}/${overdueTaskNotificationCollectionId}`;

export const overdueTaskNotificationDocumentPath = ({
  notificationId,
  taskId,
  workspaceId,
}: {
  readonly notificationId: string;
  readonly taskId: string;
  readonly workspaceId: string;
}): string =>
  `${overdueTaskNotificationCollectionPath({
    taskId,
    workspaceId,
  })}/${notificationId}`;
