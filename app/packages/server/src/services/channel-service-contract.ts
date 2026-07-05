import type {
  ChannelBlockRepository,
  ChannelEventRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  IdGenerator,
  SlackGateway,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import type { ChannelVisibilityService } from './channel-visibility-service';
import type {
  Channel,
  ChannelBlock,
  ChannelEvent,
  ChannelReviewState,
  ChannelStatus,
} from '@exe/domain';

export interface ChannelServiceDeps {
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly idGenerator: IdGenerator;
  readonly slackGateway: SlackGateway;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

export interface PatchChannelInput {
  readonly assigneeSlackUserIds?: readonly string[];
  readonly latestInfo?: string;
  readonly status?: ChannelStatus;
  readonly watcherSlackUserIds?: readonly string[];
}

export interface CreateChannelBlockInput {
  readonly description?: string;
  readonly title: string;
}

export interface UpdateChannelBlockInput {
  readonly description?: string;
  readonly title?: string;
}

export interface RecordChannelReviewInput {
  // Free-form self report ("what I did since last check"). Optional because the
  // self report can be derived from completed tasks.
  readonly lastSelfReport?: string;
  // Next time this person plans to check this channel (ISO date-time). When it
  // is 8+ days out the caller is expected to also supply nextCheckReason.
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  // The composed channel status text confirmed at the end of the channel check.
  readonly statusText?: string;
}

export interface ChannelService {
  readonly getChannelForUser: (params: {
    readonly channelId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Channel>;
  readonly listAssignedChannelsForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Channel[]>;
  readonly listChannelEventsForUser: (params: {
    readonly channelId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly ChannelEvent[]>;
  readonly listChannelsForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Channel[]>;
  readonly listWatchedChannelsForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Channel[]>;
  readonly patchChannelForUser: (params: {
    readonly channelId: string;
    readonly input: PatchChannelInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Channel>;
  readonly patchChannelForSlackUser: (params: {
    readonly channelId: string;
    readonly input: PatchChannelInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<Channel>;
  readonly putWatchedChannelsForUser: (params: {
    readonly channelIds: readonly string[];
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Channel[]>;
  readonly updateChannelLatestInfoForSlackUser: (params: {
    readonly channelId: string;
    readonly latestInfo: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<Channel>;
  readonly createChannelBlockForSlackUser: (params: {
    readonly channelId: string;
    readonly input: CreateChannelBlockInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly createChannelBlockForUser: (params: {
    readonly channelId: string;
    readonly input: CreateChannelBlockInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly resolveChannelBlockForSlackUser: (params: {
    readonly blockId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly resolveChannelBlockForUser: (params: {
    readonly blockId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly updateChannelBlockForSlackUser: (params: {
    readonly blockId: string;
    readonly input: UpdateChannelBlockInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly updateChannelBlockForUser: (params: {
    readonly blockId: string;
    readonly input: UpdateChannelBlockInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly deleteChannelBlockForSlackUser: (params: {
    readonly blockId: string;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly deleteChannelBlockForUser: (params: {
    readonly blockId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelBlock>;
  readonly listChannelBlocksForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly ChannelBlock[]>;
  readonly recordChannelReviewForSlackUser: (params: {
    readonly channelId: string;
    readonly input: RecordChannelReviewInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelReviewState>;
  readonly recordChannelReviewForUser: (params: {
    readonly channelId: string;
    readonly input: RecordChannelReviewInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<ChannelReviewState>;
  readonly listChannelReviewStatesForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly ChannelReviewState[]>;
  readonly listChannelReviewStatesForWorkspace: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly ChannelReviewState[]>;
}
