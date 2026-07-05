import type { ServerServices } from '#server/composition';
import type { ExeIosApi } from './ios-api-contract';

export type { ExeIosApi, AuthenticatedContext } from './ios-api-contract';

export const createExeIosApi = ({
  services,
}: {
  readonly services: ServerServices;
}): ExeIosApi => ({
  addWorkspaceAdmin: (context, { adminEmail, workspaceId }) =>
    services.workspace.addAdminForUser({
      adminEmail,
      userId: context.userId,
      workspaceId,
    }),
  createChannelBlock: (context, { channelId, input, workspaceId }) =>
    services.channel.createChannelBlockForUser({
      channelId,
      input,
      userId: context.userId,
      workspaceId,
    }),
  createLiveKitToken: (context, { callSessionId, workspaceId }) =>
    services.liveKitToken.createJoinTokenForUser({
      callSessionId,
      userId: context.userId,
      workspaceId,
    }),
  deleteChannelBlock: (context, { blockId, workspaceId }) =>
    services.channel.deleteChannelBlockForUser({
      blockId,
      userId: context.userId,
      workspaceId,
    }),
  deleteWorkspaceAdmin: (context, { adminEmail, workspaceId }) =>
    services.workspace.deleteAdminForUser({
      adminEmail,
      userId: context.userId,
      workspaceId,
    }),
  ensureLiveKitAgent: (context, { callSessionId, workspaceId }) =>
    services.liveKitToken.ensureAgentDispatchedForUser({
      callSessionId,
      userId: context.userId,
      workspaceId,
    }),
  getCallSchedule: (context, { workspaceId }) =>
    services.callSchedule.getForUser({
      userId: context.userId,
      workspaceId,
    }),
  getCallSession: (context, { callSessionId, workspaceId }) =>
    services.callSession.getForUser({
      callSessionId,
      userId: context.userId,
      workspaceId,
    }),
  getChannel: (context, { channelId, workspaceId }) =>
    services.channel.getChannelForUser({
      channelId,
      userId: context.userId,
      workspaceId,
    }),
  getMe: (context) => services.workspace.getMe({ userId: context.userId }),
  getSlackTeam: (context, { workspaceId }) =>
    services.workspace.getSlackTeamForUser({
      userId: context.userId,
      workspaceId,
    }),
  getTask: (context, { taskId, workspaceId }) =>
    services.task.getTaskForUser({
      taskId,
      userId: context.userId,
      workspaceId,
    }),
  listAssignedChannels: (context, { workspaceId }) =>
    services.channel.listAssignedChannelsForUser({
      userId: context.userId,
      workspaceId,
    }),
  listCallEvents: (context, { callSessionId, workspaceId }) =>
    services.callSession.listEventsForUser({
      callSessionId,
      userId: context.userId,
      workspaceId,
    }),
  listChannelBlocks: (context, { workspaceId }) =>
    services.channel.listChannelBlocksForUser({
      userId: context.userId,
      workspaceId,
    }),
  listChannelEvents: (context, { channelId, workspaceId }) =>
    services.channel.listChannelEventsForUser({
      channelId,
      userId: context.userId,
      workspaceId,
    }),
  listChannelReviewStates: (context, { workspaceId }) =>
    services.channel.listChannelReviewStatesForUser({
      userId: context.userId,
      workspaceId,
    }),
  listChannels: (context, { workspaceId }) =>
    services.channel.listChannelsForUser({
      userId: context.userId,
      workspaceId,
    }),
  listFollowUpTasks: (context, { workspaceId }) =>
    services.task.listFollowUpsForUser({
      userId: context.userId,
      workspaceId,
    }),
  listRequestedWorkTasks: (context, { workspaceId }) =>
    services.task.listRequestedWorkTasksForUser({
      userId: context.userId,
      workspaceId,
    }),
  listSlackMembers: (context, { workspaceId }) =>
    services.workspace.listSlackMembersForUser({
      userId: context.userId,
      workspaceId,
    }),
  listWatchedChannels: (context, { workspaceId }) =>
    services.channel.listWatchedChannelsForUser({
      userId: context.userId,
      workspaceId,
    }),
  listWorkspaceChannelReviewStates: (context, { workspaceId }) =>
    services.channel.listChannelReviewStatesForWorkspace({
      userId: context.userId,
      workspaceId,
    }),
  listWorkspaces: (context) =>
    services.workspace.listForUser({ userId: context.userId }),
  listWorkTasks: (context, { workspaceId }) =>
    services.task.listWorkTasksForUser({
      userId: context.userId,
      workspaceId,
    }),
  patchChannel: (context, { channelId, input, workspaceId }) =>
    services.channel.patchChannelForUser({
      channelId,
      input,
      userId: context.userId,
      workspaceId,
    }),
  patchTask: (context, { patch, workspaceId }) =>
    services.task.patchTaskForUser({
      patch,
      userId: context.userId,
      workspaceId,
    }),
  putAccounts: (
    context,
    { adminSlackUserIds, channelOwnerEditorSlackUserIds, workspaceId }
  ) =>
    services.workspace.putAccountsForUser({
      adminSlackUserIds,
      channelOwnerEditorSlackUserIds,
      userId: context.userId,
      workspaceId,
    }),
  putCallSchedule: (context, { input, workspaceId }) =>
    services.callSchedule.putForUser({
      input,
      userId: context.userId,
      workspaceId,
    }),
  putWatchedChannels: (context, { channelIds, workspaceId }) =>
    services.channel.putWatchedChannelsForUser({
      channelIds,
      userId: context.userId,
      workspaceId,
    }),
  recordCallEvent: (context, { callSessionId, payload, type, workspaceId }) =>
    services.callSession.recordEventForUser({
      callSessionId,
      payload,
      type,
      userId: context.userId,
      workspaceId,
    }),
  recordChannelReview: (context, { channelId, input, workspaceId }) =>
    services.channel.recordChannelReviewForUser({
      channelId,
      input,
      userId: context.userId,
      workspaceId,
    }),
  registerDeviceToken: (context, { environment, kind, token }) =>
    services.deviceToken.registerIosDeviceToken({
      environment,
      kind,
      token,
      userId: context.userId,
    }),
  registerFirstWorkspaceAdmin: (context, { workspaceId }) =>
    services.workspace.registerFirstAdminForUser({
      userId: context.userId,
      workspaceId,
    }),
  resolveChannelBlock: (context, { blockId, workspaceId }) =>
    services.channel.resolveChannelBlockForUser({
      blockId,
      userId: context.userId,
      workspaceId,
    }),
  startManualReviewCall: (context, { mode, workspaceId }) =>
    services.callSession.createManualReviewCall({
      ...(mode === undefined ? {} : { mode }),
      userId: context.userId,
      workspaceId,
    }),
  transitionCallSession: (context, { callSessionId, status, workspaceId }) =>
    services.callSession.transitionCallForUser({
      callSessionId,
      status,
      userId: context.userId,
      workspaceId,
    }),
  updateChannelBlock: (context, { blockId, input, workspaceId }) =>
    services.channel.updateChannelBlockForUser({
      blockId,
      input,
      userId: context.userId,
      workspaceId,
    }),
});
