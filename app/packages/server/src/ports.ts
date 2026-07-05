import type { SlackMessageReference } from './gateways';
import type {
  CallEvent,
  CallSchedule,
  CallSession,
  Channel,
  ChannelBlock,
  ChannelEvent,
  ChannelReviewState,
  DeviceToken,
  Meeting,
  OverdueTaskNotification,
  SignInCode,
  SlackMemberIndexEntry,
  Task,
  UserProfile,
  Workspace,
} from '@exe/domain';

export * from './gateways';

export type CallNotificationKind =
  | 'call_summary'
  | 'follow_up_answer'
  | 'missed'
  | 'overload_call'
  | 'prenotification'
  | 'scheduled_call_due'
  | 'scheduled_call_start';

export interface CallNotificationRecord {
  readonly callScheduleId?: string;
  readonly callSessionId?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly kind: CallNotificationKind;
  readonly slackMessage?: SlackMessageReference;
  readonly targetRunAt?: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface Clock {
  readonly now: () => string;
}

export interface IdGenerator {
  readonly generateId: () => string;
}

export interface WorkspaceTokenFields {
  readonly botTokenExpiresAt?: string;
  readonly encryptedBotRefreshToken?: string;
  readonly encryptedBotToken: string;
  readonly updatedAt: string;
}

export interface CallEventRepository {
  readonly create: (params: { readonly event: CallEvent }) => Promise<void>;
  readonly listByCallSessionId: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<readonly CallEvent[]>;
}

export interface CallNotificationRepository {
  readonly create: (params: {
    readonly record: CallNotificationRecord;
  }) => Promise<void>;
  readonly exists: (params: {
    readonly callSessionId?: string;
    readonly kind: CallNotificationKind;
    readonly targetRunAt?: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<boolean>;
  readonly listByScheduledRun: (params: {
    readonly targetRunAt: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly CallNotificationRecord[]>;
  readonly updateSlackMessage: (params: {
    readonly notificationId: string;
    readonly slackMessage: SlackMessageReference;
    readonly workspaceId: string;
  }) => Promise<void>;
}

export interface OverdueTaskNotificationRepository {
  readonly create: (params: {
    readonly notification: OverdueTaskNotification;
  }) => Promise<void>;
  readonly deleteByTask: (params: {
    readonly taskId: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly listByTask: (params: {
    readonly taskId: string;
    readonly workspaceId: string;
  }) => Promise<readonly OverdueTaskNotification[]>;
}

export interface CallScheduleRepository {
  readonly getById: (params: {
    readonly callScheduleId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule | null>;
  readonly getByUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule | null>;
  readonly listEnabled: () => Promise<readonly CallSchedule[]>;
  readonly upsert: (params: {
    readonly schedule: CallSchedule;
  }) => Promise<void>;
}

export interface CallSessionRepository {
  readonly create: (params: { readonly session: CallSession }) => Promise<void>;
  readonly getById: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession | null>;
  readonly listBusyForLiveKitIdleCheck: (params: {
    readonly createdAfter: string;
  }) => Promise<readonly CallSession[]>;
  readonly listEndedWithoutSummary: () => Promise<readonly CallSession[]>;
  readonly listMissedWithoutNotification: () => Promise<readonly CallSession[]>;
  readonly update: (params: { readonly session: CallSession }) => Promise<void>;
}

export interface DeviceTokenRepository {
  readonly listByUser: (params: {
    readonly userId: string;
  }) => Promise<readonly DeviceToken[]>;
  readonly removeByRegistration: (params: {
    readonly environment: DeviceToken['environment'];
    readonly kind: DeviceToken['kind'];
    readonly token: string;
  }) => Promise<void>;
  readonly removeByTokens: (params: {
    readonly tokens: readonly string[];
  }) => Promise<void>;
  readonly upsert: (params: {
    readonly deviceToken: DeviceToken;
  }) => Promise<void>;
}

export interface ChannelBlockRepository {
  readonly create: (params: { readonly block: ChannelBlock }) => Promise<void>;
  readonly delete: (params: {
    readonly blockId: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly getById: (params: {
    readonly blockId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock | null>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly ChannelBlock[]>;
  readonly update: (params: { readonly block: ChannelBlock }) => Promise<void>;
}

export interface ChannelReviewStateRepository {
  readonly getByChannelAndUser: (params: {
    readonly channelId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelReviewState | null>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly ChannelReviewState[]>;
  readonly upsert: (params: {
    readonly state: ChannelReviewState;
  }) => Promise<void>;
}

export interface ChannelEventRepository {
  readonly create: (params: { readonly event: ChannelEvent }) => Promise<void>;
  readonly listByChannel: (params: {
    readonly channelId: string;
    readonly workspaceId: string;
  }) => Promise<readonly ChannelEvent[]>;
}

export interface ChannelRepository {
  readonly getById: (params: {
    readonly channelId: string;
    readonly workspaceId: string;
  }) => Promise<Channel | null>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly Channel[]>;
  readonly upsert: (params: { readonly channel: Channel }) => Promise<void>;
}

export interface MeetingRepository {
  readonly create: (params: { readonly meeting: Meeting }) => Promise<void>;
  readonly getById: (params: {
    readonly meetingId: string;
    readonly workspaceId: string;
  }) => Promise<Meeting | null>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly Meeting[]>;
  readonly update: (params: { readonly meeting: Meeting }) => Promise<void>;
}

export interface SignInCodeRepository {
  readonly create: (params: {
    readonly signInCode: SignInCode;
  }) => Promise<void>;
  readonly deleteById: (params: {
    readonly signInCodeId: string;
  }) => Promise<void>;
  readonly findByEmailAndCode: (params: {
    readonly code: string;
    readonly email: string;
  }) => Promise<SignInCode | null>;
}

export interface TaskRepository {
  readonly create: (params: { readonly task: Task }) => Promise<void>;
  readonly getById: (params: {
    readonly taskId: string;
    readonly workspaceId: string;
  }) => Promise<Task | null>;
  readonly listByAssignee: (params: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Task[]>;
  readonly listByRequester: (params: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Task[]>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly Task[]>;
  readonly update: (params: { readonly task: Task }) => Promise<void>;
}

export interface UserProfileRepository {
  readonly getById: (params: {
    readonly userId: string;
  }) => Promise<UserProfile | null>;
  readonly listByWorkspace: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly UserProfile[]>;
  readonly upsert: (params: {
    readonly userProfile: UserProfile;
  }) => Promise<void>;
}

export interface SlackMemberIndexRepository {
  readonly deleteEntry: (params: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly listByEmail: (params: {
    readonly email: string;
  }) => Promise<readonly SlackMemberIndexEntry[]>;
  readonly upsert: (params: {
    readonly entry: SlackMemberIndexEntry;
  }) => Promise<void>;
}

export interface WorkspaceRepository {
  readonly getById: (params: {
    readonly workspaceId: string;
  }) => Promise<Workspace | null>;
  readonly listAll: () => Promise<readonly Workspace[]>;
  readonly listByIds: (params: {
    readonly workspaceIds: readonly string[];
  }) => Promise<readonly Workspace[]>;
  readonly upsert: (params: { readonly workspace: Workspace }) => Promise<void>;
  // Serialize Slack bot token refresh per workspace. Returns true only when the
  // caller now owns the lock (no live lock, or the previous lease expired).
  readonly acquireTokenRefreshLock: (params: {
    readonly expiresAt: string;
    readonly now: string;
    readonly ownerId: string;
    readonly workspaceId: string;
  }) => Promise<boolean>;
  // Release the lock only if still owned by this owner (no-op otherwise).
  readonly releaseTokenRefreshLock: (params: {
    readonly ownerId: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  // Persist refreshed token fields without clobbering concurrently-updated
  // workspace fields (admin, timezone, ...). Merge-only partial update.
  readonly updateTokens: (params: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }) => Promise<void>;
}
