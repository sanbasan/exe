/* eslint-disable max-lines -- Gateway interfaces are kept together as one server-boundary contract. */
import type {
  CallSummaryChannelUpdate,
  ChannelBlockCreatedFromCallMessageReference,
  SlackBotTokenRefresh,
  SlackChannelInfo,
  SlackMembership,
  SlackMessage,
  SlackMessageReference,
  SlackOAuthInstallation,
  SlackUserConversations,
  SlackUserLookup,
  SlackWorkspaceInfo,
  SlackWorkspaceMember,
  TaskCreatedFromCallMessageReference,
} from './slack-gateway-types';
import type {
  CallSchedule,
  CallSession,
  ChannelBlock,
  DeviceToken,
  Task,
  TaskPatch,
  Workspace,
} from '@exe/domain';
import type { KnownBlock, View } from '@slack/types';

export * from './slack-gateway-types';

export interface AuthUserRecord {
  readonly email?: string;
  readonly uid: string;
}

export interface GBrainToken {
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly name: string;
}

export interface GBrainConnection {
  // Ready-to-run `claude mcp add ...` command with the freshly minted token
  // embedded. Only ever surfaced once, at creation time.
  readonly connect: string;
  readonly mcpUrl: string;
  readonly token: string;
}

// Talks to the multi-tenant GBrain router's admin API (bearer = the router
// admin token). Every operation is scoped to one workspace's brain.
export interface GBrainAdminGateway {
  readonly listTokens: (params: {
    readonly workspaceId: string;
  }) => Promise<readonly GBrainToken[]>;
  readonly mintToken: (params: {
    readonly name: string;
    readonly workspaceId: string;
  }) => Promise<GBrainConnection | null>;
  readonly revokeToken: (params: {
    readonly name: string;
    readonly workspaceId: string;
  }) => Promise<boolean>;
}

// Writes to the multi-tenant GBrain router (bearer = the ingest token).
// Implementations must be safe to call unconditionally: when GBrain is not
// configured the gateway no-ops.
export interface GBrainIngestGateway {
  readonly extractFacts: (params: {
    readonly sessionId?: string;
    readonly text: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly ingestPage: (params: {
    readonly markdown: string;
    readonly slug: string;
    readonly workspaceId: string;
  }) => Promise<void>;
  readonly isEnabled: () => boolean;
}

export interface SlackGateway {
  readonly exchangeCodeForInstallation: (params: {
    readonly code: string;
    readonly redirectUri?: string;
  }) => Promise<SlackOAuthInstallation>;
  readonly refreshBotToken: (params: {
    readonly refreshToken: string;
  }) => Promise<SlackBotTokenRefresh>;
  readonly getChannelInfo: (params: {
    readonly botToken: string;
    readonly channelId: string;
  }) => Promise<SlackChannelInfo | null>;
  readonly getUserInfo: (params: {
    readonly botToken: string;
    readonly slackUserId: string;
  }) => Promise<SlackUserLookup>;
  readonly getReplies: (params: {
    readonly botToken: string;
    readonly channelId: string;
    readonly inclusive: boolean;
    readonly latest: string;
    readonly limit: number;
    readonly threadTs: string;
  }) => Promise<readonly SlackMessage[]>;
  readonly getWorkspaceInfo: (params: {
    readonly botToken: string;
  }) => Promise<SlackWorkspaceInfo | null>;
  readonly listBotJoinedChannels: (params: {
    readonly botToken: string;
  }) => Promise<readonly SlackChannelInfo[]>;
  readonly listUserJoinedChannelIds: (params: {
    readonly botToken: string;
    readonly slackUserId: string;
  }) => Promise<SlackUserConversations>;
  // Enumerate active (non-deleted, non-bot) members that have an email. Used to
  // seed the membership index. May make several paginated Slack calls.
  readonly listWorkspaceMembers: (params: {
    readonly botToken: string;
  }) => Promise<readonly SlackWorkspaceMember[]>;
  readonly lookupUserByEmail: (params: {
    readonly botToken: string;
    readonly email: string;
  }) => Promise<SlackUserLookup>;
  readonly verifyMembershipByEmail: (params: {
    readonly botToken: string;
    readonly email: string;
  }) => Promise<SlackMembership>;
  readonly openView: (params: {
    readonly botToken: string;
    readonly triggerId: string;
    readonly view: View;
  }) => Promise<void>;
  readonly deleteMessage: (params: {
    readonly botToken: string;
    readonly channelId: string;
    readonly messageTs: string;
  }) => Promise<void>;
  readonly updateView: (params: {
    readonly botToken: string;
    readonly hash?: string;
    readonly view: View;
    readonly viewId: string;
  }) => Promise<void>;
  readonly postMessage: (params: {
    readonly blocks: readonly KnownBlock[];
    readonly botToken: string;
    readonly channelId: string;
    readonly text: string;
    readonly threadTs?: string;
    readonly unfurlLinks?: boolean;
  }) => Promise<string>;
  readonly publishHomeView: (params: {
    readonly botToken: string;
    readonly userId: string;
    readonly view: View;
  }) => Promise<void>;
  readonly updateMessage: (params: {
    readonly blocks: readonly KnownBlock[];
    readonly botToken: string;
    readonly channelId: string;
    readonly messageTs: string;
    readonly text: string;
  }) => Promise<void>;
}

export interface AuthGateway {
  readonly createCustomToken: (params: {
    readonly uid: string;
  }) => Promise<string>;
  readonly createUser: (params: {
    readonly email: string;
  }) => Promise<AuthUserRecord>;
  readonly getUserByEmail: (params: {
    readonly email: string;
  }) => Promise<AuthUserRecord | null>;
}

export interface EmailGateway {
  readonly sendSignInCode: (params: {
    readonly code: string;
    readonly email: string;
    readonly html: string;
    readonly subject: string;
  }) => Promise<void>;
}

export interface LiveKitGateway {
  readonly createParticipantToken: (params: {
    readonly agentName: string;
    readonly identity: string;
    readonly metadata: string;
    readonly roomName: string;
  }) => Promise<string>;
  readonly deleteRoom: (params: { readonly roomName: string }) => Promise<void>;
  readonly ensureAgentDispatched: (params: {
    readonly agentName: string;
    readonly metadata: string;
    readonly roomName: string;
  }) => Promise<void>;
  readonly warmUpAgentWorker: () => Promise<void>;
}

export interface LiveKitVmGateway {
  readonly ensureRunning: () => Promise<void>;
  readonly stopIfRunning: () => Promise<void>;
}

export interface NotificationGateway {
  readonly sendCallPrenotification: (params: {
    readonly schedule: CallSchedule;
    readonly session: CallSession;
    readonly slackUserId: string;
    readonly targetRunAt: string;
    readonly workspace: Workspace;
  }) => Promise<SlackMessageReference>;
  readonly sendScheduledCallDueNotification: (params: {
    readonly schedule: CallSchedule;
    readonly session: CallSession;
    readonly slackUserId: string;
    readonly targetRunAt: string;
    readonly workspace: Workspace;
  }) => Promise<SlackMessageReference>;
  readonly sendCallSummary: (params: {
    readonly channelUpdates?: readonly CallSummaryChannelUpdate[];
    readonly overview?: string;
    readonly session: CallSession;
    readonly slackUserId: string;
    readonly summary: string;
    readonly workspace: Workspace;
  }) => Promise<void>;
  readonly sendFollowUpAnswer: (params: {
    readonly requesterSlackUserId: string;
    readonly task: Task;
    readonly workspace: Workspace;
  }) => Promise<void>;
  readonly sendIncomingCall: (params: {
    readonly session: CallSession;
    readonly tokens: readonly DeviceToken[];
    readonly workspace: Workspace;
  }) => Promise<readonly string[]>;
  readonly sendMissedCallNotice: (params: {
    readonly session: CallSession;
    readonly slackUserId: string;
    readonly workspace: Workspace;
  }) => Promise<void>;
  readonly sendOverdueTaskNotification: (params: {
    readonly task: Task;
    readonly workspace: Workspace;
  }) => Promise<{
    readonly channelId: string;
    readonly messageTs: string;
    readonly threadTs: string;
  } | null>;
  // Posts one channel anchor for blocks created during a call session and then
  // posts each block card as a reply in that anchor thread.
  readonly sendChannelBlocksCreatedFromCall: (params: {
    readonly blocks: readonly ChannelBlock[];
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly workspace: Workspace;
  }) => Promise<readonly ChannelBlockCreatedFromCallMessageReference[]>;
  // Rewrites a posted block card in place to reflect the block's current
  // state (or a deleted marker). No-op when the block has no messageTs.
  readonly updateChannelBlockMessage: (params: {
    readonly block: ChannelBlock;
    readonly deleted?: boolean;
    readonly workspace: Workspace;
  }) => Promise<void>;
  // Posts the meeting anchor ("tasks were created in <title>") to a channel,
  // then each task card as a reply in the anchor thread. Anchor is posted
  // even when tasks is empty.
  readonly sendMeetingTasksCreated: (params: {
    readonly channelId: string;
    readonly meetingTitle: string;
    readonly tasks: readonly Task[];
    readonly workspace: Workspace;
  }) => Promise<{
    readonly anchorTs: string;
    readonly channelId: string;
    readonly taskMessages: readonly {
      readonly messageTs: string;
      readonly taskId: string;
      readonly threadTs: string;
    }[];
  }>;
  // Posts a single task card to its channel (web-created tasks without a
  // meeting anchor).
  readonly sendTaskCardToChannel: (params: {
    readonly channelId: string;
    readonly task: Task;
    readonly workspace: Workspace;
  }) => Promise<{ readonly messageTs: string }>;
  // Posts one dependency notice into each thread target (meeting thread,
  // the other task's thread, ...).
  readonly sendTaskDependencyNotices: (params: {
    readonly blockedTitle: string;
    readonly blockerTitle: string;
    readonly targets: readonly {
      readonly channelId: string;
      readonly threadTs?: string;
    }[];
    readonly workspace: Workspace;
  }) => Promise<void>;
  // Posts one channel anchor for tasks created during a call session and then
  // posts each task card as a reply in that anchor thread.
  readonly sendTasksCreatedFromCall: (params: {
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly tasks: readonly Task[];
    readonly workspace: Workspace;
  }) => Promise<readonly TaskCreatedFromCallMessageReference[]>;
  readonly sendTaskPatchThreadNotice: (params: {
    readonly patch: TaskPatch;
    readonly previousTask: Task;
    readonly task: Task;
    readonly workspace: Workspace;
  }) => Promise<void>;
}
