import type {
  CallEventRepository,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelEventRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  Clock,
  DeviceTokenRepository,
  IdGenerator,
  LiveKitVmGateway,
  NotificationGateway,
  OverdueTaskNotificationRepository,
  SlackGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import type { CallOverviewComposer } from '#server/services/call-overview-composer';
import type { CallSessionService } from '#server/services/call-session-service';
import type { ChannelLatestInfoSynthesizer } from '#server/services/channel-latest-info-synthesizer';
import type { ChannelService } from '#server/services/channel-service';
import type { ErrorReportContext } from '#server/utils';

export interface WorkflowErrorReport {
  readonly context: ErrorReportContext;
  readonly error: unknown;
}

export interface WorkflowErrorReporter {
  readonly report: (params: WorkflowErrorReport) => Promise<void>;
}

export interface CallWorkflowDeps {
  readonly callEventRepository: CallEventRepository;
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callOverviewComposer: CallOverviewComposer;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelLatestInfoSynthesizer: ChannelLatestInfoSynthesizer;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelService: Pick<
    ChannelService,
    | 'createChannelBlockForSlackUser'
    | 'deleteChannelBlockForSlackUser'
    | 'recordChannelReviewForSlackUser'
    | 'resolveChannelBlockForSlackUser'
    | 'updateChannelBlockForSlackUser'
    | 'updateChannelLatestInfoForSlackUser'
  >;
  readonly callSessionService: CallSessionService;
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly encryptionKey?: string;
  readonly errorReporter: WorkflowErrorReporter;
  readonly idGenerator: IdGenerator;
  readonly liveKitVmAutoStopEnabled: boolean;
  readonly liveKitVmGateway: LiveKitVmGateway;
  readonly liveKitVmIdleGraceMinutes: number;
  readonly notificationGateway: NotificationGateway;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}
