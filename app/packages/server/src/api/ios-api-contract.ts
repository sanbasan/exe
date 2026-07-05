import type { PutCallScheduleInput } from '#server/services/call-schedule-service';
import type { CallSessionWithAgenda } from '#server/services/call-session-service';
import type {
  CreateChannelBlockInput,
  PatchChannelInput,
  RecordChannelReviewInput,
  UpdateChannelBlockInput,
} from '#server/services/channel-service';
import type {
  CallEvent,
  CallEventPayload,
  CallEventType,
  CallSchedule,
  CallSession,
  CallStatus,
  Channel,
  ChannelBlock,
  ChannelEvent,
  ChannelReviewState,
  DeviceToken,
  Environment,
  FollowUpTask,
  SlackWorkspaceMember,
  SlackWorkspaceTeam,
  Task,
  TaskPatch,
  UserProfile,
  WorkTask,
  WorkspaceSummary,
} from '@exe/domain';

export interface AuthenticatedContext {
  readonly userId: string;
}

export interface ExeIosApi {
  readonly addWorkspaceAdmin: (
    context: AuthenticatedContext,
    params: {
      readonly adminEmail: string;
      readonly workspaceId: string;
    }
  ) => Promise<WorkspaceSummary>;
  readonly createLiveKitToken: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly workspaceId: string;
    }
  ) => Promise<{ readonly session: CallSession; readonly token: string }>;
  readonly createChannelBlock: (
    context: AuthenticatedContext,
    params: {
      readonly channelId: string;
      readonly input: CreateChannelBlockInput;
      readonly workspaceId: string;
    }
  ) => Promise<ChannelBlock>;
  readonly ensureLiveKitAgent: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly workspaceId: string;
    }
  ) => Promise<{ readonly session: CallSession }>;
  readonly deleteChannelBlock: (
    context: AuthenticatedContext,
    params: {
      readonly blockId: string;
      readonly workspaceId: string;
    }
  ) => Promise<ChannelBlock>;
  readonly deleteWorkspaceAdmin: (
    context: AuthenticatedContext,
    params: {
      readonly adminEmail: string;
      readonly workspaceId: string;
    }
  ) => Promise<WorkspaceSummary>;
  readonly getCallSchedule: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<CallSchedule>;
  readonly getCallSession: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly workspaceId: string;
    }
  ) => Promise<CallSession>;
  readonly getChannel: (
    context: AuthenticatedContext,
    params: { readonly channelId: string; readonly workspaceId: string }
  ) => Promise<Channel>;
  readonly getMe: (context: AuthenticatedContext) => Promise<UserProfile>;
  readonly getSlackTeam: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<SlackWorkspaceTeam | null>;
  readonly getTask: (
    context: AuthenticatedContext,
    params: { readonly taskId: string; readonly workspaceId: string }
  ) => Promise<Task>;
  readonly listAssignedChannels: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly Channel[]>;
  readonly listCallEvents: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly workspaceId: string;
    }
  ) => Promise<readonly CallEvent[]>;
  readonly listChannelEvents: (
    context: AuthenticatedContext,
    params: { readonly channelId: string; readonly workspaceId: string }
  ) => Promise<readonly ChannelEvent[]>;
  readonly listChannelBlocks: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly ChannelBlock[]>;
  readonly listChannelReviewStates: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly ChannelReviewState[]>;
  readonly listChannels: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly Channel[]>;
  readonly listFollowUpTasks: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly FollowUpTask[]>;
  readonly listRequestedWorkTasks: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly WorkTask[]>;
  readonly listSlackMembers: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly SlackWorkspaceMember[]>;
  readonly listWatchedChannels: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly Channel[]>;
  readonly listWorkspaceChannelReviewStates: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly ChannelReviewState[]>;
  readonly listWorkspaces: (
    context: AuthenticatedContext
  ) => Promise<readonly WorkspaceSummary[]>;
  readonly listWorkTasks: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<readonly WorkTask[]>;
  readonly patchChannel: (
    context: AuthenticatedContext,
    params: {
      readonly channelId: string;
      readonly input: PatchChannelInput;
      readonly workspaceId: string;
    }
  ) => Promise<Channel>;
  readonly patchTask: (
    context: AuthenticatedContext,
    params: { readonly patch: TaskPatch; readonly workspaceId: string }
  ) => Promise<Task>;
  readonly putAccounts: (
    context: AuthenticatedContext,
    params: {
      readonly adminSlackUserIds: readonly string[];
      readonly channelOwnerEditorSlackUserIds: readonly string[];
      readonly workspaceId: string;
    }
  ) => Promise<WorkspaceSummary>;
  readonly putCallSchedule: (
    context: AuthenticatedContext,
    params: {
      readonly input: PutCallScheduleInput;
      readonly workspaceId: string;
    }
  ) => Promise<CallSchedule>;
  readonly putWatchedChannels: (
    context: AuthenticatedContext,
    params: {
      readonly channelIds: readonly string[];
      readonly workspaceId: string;
    }
  ) => Promise<readonly Channel[]>;
  readonly recordCallEvent: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly payload: CallEventPayload;
      readonly type: CallEventType;
      readonly workspaceId: string;
    }
  ) => Promise<CallEvent>;
  readonly recordChannelReview: (
    context: AuthenticatedContext,
    params: {
      readonly channelId: string;
      readonly input: RecordChannelReviewInput;
      readonly workspaceId: string;
    }
  ) => Promise<ChannelReviewState>;
  readonly resolveChannelBlock: (
    context: AuthenticatedContext,
    params: {
      readonly blockId: string;
      readonly workspaceId: string;
    }
  ) => Promise<ChannelBlock>;
  readonly registerDeviceToken: (
    context: AuthenticatedContext,
    params: {
      readonly environment: Environment;
      readonly kind: DeviceToken['kind'];
      readonly token: string;
    }
  ) => Promise<DeviceToken>;
  readonly registerFirstWorkspaceAdmin: (
    context: AuthenticatedContext,
    params: { readonly workspaceId: string }
  ) => Promise<WorkspaceSummary>;
  readonly startManualReviewCall: (
    context: AuthenticatedContext,
    params: {
      readonly mode?: 'auto' | 'manual_review' | 'scheduled_review';
      readonly workspaceId: string;
    }
  ) => Promise<CallSessionWithAgenda>;
  readonly transitionCallSession: (
    context: AuthenticatedContext,
    params: {
      readonly callSessionId: string;
      readonly status: CallStatus;
      readonly workspaceId: string;
    }
  ) => Promise<CallSession>;
  readonly updateChannelBlock: (
    context: AuthenticatedContext,
    params: {
      readonly blockId: string;
      readonly input: UpdateChannelBlockInput;
      readonly workspaceId: string;
    }
  ) => Promise<ChannelBlock>;
}
