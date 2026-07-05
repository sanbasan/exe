import {
  dateTimeSchema,
  slackChannelIdSchema,
  slackUserIdSchema,
  workspaceIdSchema,
} from './common';
import {
  canManageWorkspaceSettings,
  isWorkspaceChannelOwnerEditor,
  type Workspace,
} from './workspace';
import { z } from 'zod';

export const channelStatusSchema = z.enum(['active', 'archived']);

export const channelSchema = z
  .object({
    assigneeSlackUserIds: z.array(slackUserIdSchema),
    channelId: slackChannelIdSchema,
    createdAt: dateTimeSchema,
    createdBySlackUserId: slackUserIdSchema,
    isPrivate: z.boolean().optional(),
    latestInfo: z.string().min(1).optional(),
    latestInfoUpdatedAt: dateTimeSchema.optional(),
    name: z.string().min(1),
    status: channelStatusSchema,
    updatedAt: dateTimeSchema,
    watcherSlackUserIds: z.array(slackUserIdSchema),
    workspaceId: workspaceIdSchema,
  })
  .strict();

// A composed latest-info draft for a channel, proposed during a call and
// applied to Channel.latestInfo after the call (like task/follow-up drafts).
// draftId ties revisions and discards together (a later proposal with the same
// draftId supersedes the earlier one); it is optional to match the shared
// draftId-based dedupe used for the other call drafts.
export const latestInfoDraftSchema = z
  .object({
    channelId: slackChannelIdSchema,
    channelName: z.string().min(1),
    draftId: z.string().min(1).optional(),
    latestInfo: z.string().min(1),
  })
  .strict();

export const channelEventSourceSchema = z.enum([
  'call',
  'manual',
  'slack',
  'system',
]);

export const channelEventTypeSchema = z.enum([
  'call_summary',
  'channel_metadata_updated',
  'external_summary',
  'follow_up_task_answered',
  'task_created',
  'task_updated',
]);

export const channelEventSchema = z
  .object({
    body: z.string().min(1).optional(),
    channelId: slackChannelIdSchema,
    createdAt: dateTimeSchema,
    id: z.string().min(1),
    occurredAt: dateTimeSchema,
    source: channelEventSourceSchema,
    sourceRef: z.string().min(1).optional(),
    title: z.string().min(1),
    type: channelEventTypeSchema,
    workspaceId: workspaceIdSchema,
  })
  .strict();

export type Channel = z.infer<typeof channelSchema>;

export type ChannelEvent = z.infer<typeof channelEventSchema>;

export type ChannelEventSource = z.infer<typeof channelEventSourceSchema>;

export type ChannelEventType = z.infer<typeof channelEventTypeSchema>;

export type ChannelStatus = z.infer<typeof channelStatusSchema>;

export type LatestInfoDraft = z.infer<typeof latestInfoDraftSchema>;

export const isChannelAssignee = ({
  channel,
  slackUserId,
}: {
  readonly channel: Channel;
  readonly slackUserId: string;
}): boolean =>
  channel.assigneeSlackUserIds.some(
    (assigneeSlackUserId) => assigneeSlackUserId === slackUserId
  );

export const isChannelWatcher = ({
  channel,
  slackUserId,
}: {
  readonly channel: Channel;
  readonly slackUserId: string;
}): boolean =>
  channel.watcherSlackUserIds.some(
    (watcherSlackUserId) => watcherSlackUserId === slackUserId
  );

export const channelHasAssignee = (channel: Channel): boolean =>
  channel.assigneeSlackUserIds.length > 0;

// Per-user Slack channel visibility, resolved live from Slack (see
// services/channel-visibility-service.ts on the server).
export interface ChannelVisibilityContext {
  readonly isGuest: boolean;
  readonly joinedChannelIds: ReadonlySet<string>;
}

// Access = actual Slack channel membership, or a public channel that a
// non-guest workspace member could self-join. `isPrivate === undefined`
// (not yet synced from Slack) is treated as private, i.e. fail-closed.
// Workspace-admin bypass is NOT handled here; it lives one layer up in the
// service layer (see `ChannelVisibility` / `assertCanAccessChannel` in
// services/channel-access.ts), since it depends on avoiding a live Slack
// call entirely rather than on channel state.
export const canAccessChannel = ({
  channel,
  visibility,
}: {
  readonly channel: Channel;
  readonly visibility: ChannelVisibilityContext;
}): boolean =>
  visibility.joinedChannelIds.has(channel.channelId) ||
  (channel.isPrivate === false && !visibility.isGuest);

export const canEditChannelMetadata = ({
  channel,
  slackUserId,
  workspace,
}: {
  readonly channel: Channel;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean =>
  canManageWorkspaceSettings({ slackUserId, workspace }) ||
  isChannelAssignee({ channel, slackUserId });

// Dedicated permission for editing channel owners (assignees). Workspace
// admins always have this permission; non-admin users can be granted the
// narrower channel-owner-editor role from Slack App Home account management.
export const canEditChannelOwners = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean =>
  canManageWorkspaceSettings({ slackUserId, workspace }) ||
  isWorkspaceChannelOwnerEditor({ slackUserId, workspace });

export const getAssignedActiveChannelsForUser = ({
  channels,
  slackUserId,
}: {
  readonly channels: readonly Channel[];
  readonly slackUserId: string;
}): readonly Channel[] =>
  channels
    .filter(
      (channel) =>
        channel.status === 'active' &&
        isChannelAssignee({ channel, slackUserId })
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

export const getWatchedChannelsForUser = ({
  channels,
  slackUserId,
}: {
  readonly channels: readonly Channel[];
  readonly slackUserId: string;
}): readonly Channel[] =>
  channels
    .filter(
      (channel) =>
        channel.status === 'active' &&
        isChannelWatcher({ channel, slackUserId }) &&
        !isChannelAssignee({ channel, slackUserId })
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
