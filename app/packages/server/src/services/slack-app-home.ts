/* eslint-disable max-lines -- App Home publishing orchestrates schedule, channels, tasks, and Slack name resolution together. */
import { notFoundError } from '#server/errors';
import type {
  CallScheduleRepository,
  ChannelBlockRepository,
  Clock,
  ChannelRepository,
  ChannelReviewStateRepository,
  IdGenerator,
  SlackGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { buildWorkspaceAppUrl } from './app-links';
import { listChannelsVisibleToSlackUser } from './channel-access';
import type { ChannelVisibilityService } from './channel-visibility-service';
import { withSlackBotToken } from './slack-bot-token';
import { findUserProfileBySlackUserId } from './slack-workspace-utils';
import {
  canEditChannelOwners,
  canManageWorkspaceSettings,
  calculateNextRunAt,
  callScheduleSchema,
  getAssignedActiveChannelsForUser,
  getOpenWorkTasksForAssignee,
  getOpenWorkTasksForRequester,
  getWatchedChannelsForUser,
  hasWorkspaceAdmins,
  type CallSchedule,
  type Channel,
  type WorkTask,
  type Workspace,
} from '@exe/domain';
import { buildAdminSetupRequiredHomeView, buildAppHomeView } from '@exe/slack';

export interface SlackAppHomeDeps {
  readonly appUrl: string;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly idGenerator: IdGenerator;
  readonly channelRepository: ChannelRepository;
  readonly slackGateway: SlackGateway;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

const withNextRunAt = ({
  after,
  schedule,
}: {
  readonly after: Date;
  readonly schedule: CallSchedule;
}): CallSchedule => {
  const nextRunAt = calculateNextRunAt({ after, schedule });
  const scheduleWithoutNextRunAt = Object.fromEntries(
    Object.entries(schedule).filter(([key]) => key !== 'nextRunAt')
  );

  return callScheduleSchema.parse({
    ...scheduleWithoutNextRunAt,
    ...(nextRunAt === null ? {} : { nextRunAt }),
  });
};

const buildDefaultSchedule = ({
  deps,
  userId,
  workspace,
}: {
  readonly deps: SlackAppHomeDeps;
  readonly userId: string;
  readonly workspace: Workspace;
}): CallSchedule => {
  const now = deps.clock.now();
  const schedule = callScheduleSchema.parse({
    createdAt: now,
    enabled: true,
    excludedDates: [],
    id: deps.idGenerator.generateId(),
    preNotifyMinutes: 10,
    timeOfDay: '09:00',
    timezone: workspace.timezone,
    updatedAt: now,
    userId,
    weekdays: [1, 2, 3, 4, 5],
    workspaceId: workspace.id,
  });

  return withNextRunAt({ after: new Date(now), schedule });
};

const getOrCreateSchedule = async ({
  deps,
  userId,
  workspace,
}: {
  readonly deps: SlackAppHomeDeps;
  readonly userId: string;
  readonly workspace: Workspace;
}): Promise<CallSchedule> => {
  const existing = await deps.callScheduleRepository.getByUser({
    userId,
    workspaceId: workspace.id,
  });

  if (existing !== null) {
    return existing;
  }

  const schedule = buildDefaultSchedule({ deps, userId, workspace });

  await deps.callScheduleRepository.upsert({ schedule });

  return schedule;
};

const APP_HOME_DM_CHANNEL_NAME = 'exe';

const hasTaskInChannel = ({
  channel,
  tasks,
}: {
  readonly channel: Channel;
  readonly tasks: readonly WorkTask[];
}): boolean => tasks.some((task) => task.channelId === channel.channelId);

const uniqueChannels = (channels: readonly Channel[]): readonly Channel[] => [
  ...new Map(channels.map((channel) => [channel.channelId, channel])).values(),
];

const getEarliestTaskCreatedAt = (tasks: readonly WorkTask[]): string =>
  tasks
    .map((task) => task.createdAt)
    .toSorted((left, right) => left.localeCompare(right))
    .at(0) ?? new Date(0).toISOString();

const getLatestTaskUpdatedAt = (tasks: readonly WorkTask[]): string =>
  tasks
    .map((task) => task.updatedAt)
    .toSorted((left, right) => right.localeCompare(left))
    .at(0) ?? getEarliestTaskCreatedAt(tasks);

// Resolve a channel name (and DM flag) the way topaz does: ask Slack directly
// for every task channel that is not already a tracked workspace channel.
const resolveTaskChannelName = async ({
  channelId,
  deps,
  workspace,
}: {
  readonly channelId: string;
  readonly deps: SlackAppHomeDeps;
  readonly workspace: Workspace;
}): Promise<string> => {
  const channel = await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.getChannelInfo({ botToken, channelId }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  }).catch((): null => null);

  // Slack app DMs have no channel name, so use a stable display name.
  if (channel?.isIm === true) {
    return APP_HOME_DM_CHANNEL_NAME;
  }

  return channel?.name ?? channelId;
};

const buildTaskChannels = ({
  deps,
  existingChannelIds,
  slackUserId,
  tasks,
  workspace,
}: {
  readonly deps: SlackAppHomeDeps;
  readonly existingChannelIds: ReadonlySet<string>;
  readonly slackUserId: string;
  readonly tasks: readonly WorkTask[];
  readonly workspace: Workspace;
}): Promise<readonly Channel[]> => {
  const externalTasks = tasks.filter(
    (task): task is WorkTask & { readonly channelId: string } =>
      task.channelId !== undefined && !existingChannelIds.has(task.channelId)
  );
  const channelIds = [...new Set(externalTasks.map((task) => task.channelId))];

  return Promise.all(
    channelIds.map(async (channelId): Promise<Channel> => {
      const tasksInChannel = externalTasks.filter(
        (task) => task.channelId === channelId
      );

      return {
        assigneeSlackUserIds: [slackUserId],
        channelId,
        createdAt: getEarliestTaskCreatedAt(tasksInChannel),
        createdBySlackUserId: slackUserId,
        name: await resolveTaskChannelName({ channelId, deps, workspace }),
        status: 'active',
        updatedAt: getLatestTaskUpdatedAt(tasksInChannel),
        watcherSlackUserIds: [],
        workspaceId: workspace.id,
      };
    })
  );
};

export const getShownHomeChannels = async ({
  assignedChannels,
  channels,
  deps,
  requestedWorkTasks,
  slackUserId,
  workspace,
  workTasks,
}: {
  readonly assignedChannels: readonly Channel[];
  readonly channels: readonly Channel[];
  readonly deps: SlackAppHomeDeps;
  readonly requestedWorkTasks: readonly WorkTask[];
  readonly slackUserId: string;
  readonly workspace: Workspace;
  readonly workTasks: readonly WorkTask[];
}): Promise<readonly Channel[]> => {
  const activeChannels = channels.filter(
    (channel) => channel.status === 'active'
  );
  const activeChannelIds = new Set(
    activeChannels.map((channel) => channel.channelId)
  );
  const allHomeTasks = [...workTasks, ...requestedWorkTasks];
  const watchedChannels = getWatchedChannelsForUser({
    channels: activeChannels,
    slackUserId,
  });
  const taskChannels = activeChannels.filter((channel) =>
    hasTaskInChannel({
      channel,
      tasks: allHomeTasks,
    })
  );
  const externalTaskChannels = await buildTaskChannels({
    deps,
    existingChannelIds: activeChannelIds,
    slackUserId,
    tasks: allHomeTasks,
    workspace,
  });

  return uniqueChannels([
    ...assignedChannels,
    ...watchedChannels,
    ...taskChannels,
    ...externalTaskChannels,
  ]).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const publishSlackAppHome = async ({
  deps,
  slackTeamId,
  slackUserId,
}: {
  readonly deps: SlackAppHomeDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<void> => {
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    throw notFoundError(`Workspace ${slackTeamId} was not found.`);
  }

  const appUrl = buildWorkspaceAppUrl({
    appUrl: deps.appUrl,
    workspaceId: workspace.id,
  });
  if (!hasWorkspaceAdmins(workspace)) {
    await withSlackBotToken({
      clock: deps.clock,
      ...(deps.encryptionKey === undefined
        ? {}
        : { encryptionKey: deps.encryptionKey }),
      run: ({ botToken }) =>
        deps.slackGateway.publishHomeView({
          botToken,
          userId: slackUserId,
          view: buildAdminSetupRequiredHomeView({
            appUrl,
            language: workspace.language,
          }),
        }),
      slackGateway: deps.slackGateway,
      workspace,
      workspaceRepository: deps.workspaceRepository,
    });

    return;
  }

  const [
    tasks,
    requestedTasks,
    allChannelBlocks,
    allChannels,
    reviewStates,
    userProfiles,
  ] = await Promise.all([
    deps.taskRepository.listByAssignee({
      slackUserId,
      workspaceId: workspace.id,
    }),
    deps.taskRepository.listByRequester({
      slackUserId,
      workspaceId: workspace.id,
    }),
    deps.channelBlockRepository.listByWorkspace({
      workspaceId: workspace.id,
    }),
    deps.channelRepository.listByWorkspace({
      workspaceId: workspace.id,
    }),
    deps.channelReviewStateRepository.listByWorkspace({
      workspaceId: workspace.id,
    }),
    deps.userProfileRepository.listByWorkspace({
      workspaceId: workspace.id,
    }),
  ]);
  const visibility = await deps.channelVisibility.getVisibilityForSlackUser({
    slackUserId,
    workspace,
  });
  const channels = listChannelsVisibleToSlackUser({
    channels: allChannels,
    visibility,
  });
  const visibleChannelIds = new Set(
    channels.map((channel) => channel.channelId)
  );
  const channelBlocks =
    visibility === 'all'
      ? allChannelBlocks
      : allChannelBlocks.filter((block) =>
          visibleChannelIds.has(block.channelId)
        );
  const userProfile = findUserProfileBySlackUserId({
    slackUserId,
    userProfiles,
    workspaceId: workspace.id,
  });
  const schedule: CallSchedule | null =
    userProfile === null
      ? null
      : await getOrCreateSchedule({
          deps,
          userId: userProfile.id,
          workspace,
        });
  const workTasks = getOpenWorkTasksForAssignee({ slackUserId, tasks });
  const assignedTaskIds = new Set(workTasks.map((task) => task.id));
  const requestedWorkTasks = getOpenWorkTasksForRequester({
    slackUserId,
    tasks: requestedTasks,
  }).filter((task) => !assignedTaskIds.has(task.id));
  const assignedChannels = getAssignedActiveChannelsForUser({
    channels,
    slackUserId,
  });
  const slackInfo = await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) => deps.slackGateway.getWorkspaceInfo({ botToken }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
  const view = buildAppHomeView({
    appUrl,
    canEditChannelOwners: canEditChannelOwners({ slackUserId, workspace }),
    canManageAdmins: canManageWorkspaceSettings({ slackUserId, workspace }),
    channelBlocks,
    channels: await getShownHomeChannels({
      assignedChannels,
      channels,
      deps,
      requestedWorkTasks,
      slackUserId,
      workspace,
      workTasks,
    }),
    language: workspace.language,
    now: deps.clock.now(),
    requestedWorkTasks,
    reviewStates,
    schedule,
    slackDomain: slackInfo?.domain ?? '',
    timezone: workspace.timezone,
    workTasks,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.publishHomeView({
        botToken,
        userId: slackUserId,
        view,
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
