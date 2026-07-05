import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import { findUserProfileBySlackUserId } from './slack-workspace-utils';
import {
  calculateNextRunAt,
  callScheduleSchema,
  type CallSchedule,
  type Workspace,
} from '@exe/domain';
import {
  buildCallScheduleSettingsModal,
  buildCallScheduleSkipDateValues,
  parseCallScheduleEnabled,
  parseCallScheduleSkippedDates,
  parseCallScheduleTime,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

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

const getOrCreateScheduleForSlackUser = async ({
  deps,
  slackUserId,
  workspace,
}: {
  readonly deps: SlackAppHomeDeps;
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): Promise<CallSchedule | null> => {
  const userProfiles = await deps.userProfileRepository.listByWorkspace({
    workspaceId: workspace.id,
  });
  const userProfile = findUserProfileBySlackUserId({
    slackUserId,
    userProfiles,
    workspaceId: workspace.id,
  });

  if (userProfile === null) {
    return null;
  }

  const existing = await deps.callScheduleRepository.getByUser({
    userId: userProfile.id,
    workspaceId: workspace.id,
  });

  if (existing !== null) {
    return existing;
  }

  const schedule = buildDefaultSchedule({
    deps,
    userId: userProfile.id,
    workspace,
  });

  await deps.callScheduleRepository.upsert({ schedule });

  return schedule;
};

export const openSlackCallScheduleSettings = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackAppHomeDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.openCallScheduleSettings ||
    triggerId === undefined
  ) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  const schedule = await getOrCreateScheduleForSlackUser({
    deps,
    slackUserId,
    workspace,
  });

  if (schedule === null) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildCallScheduleSettingsModal({
          language: workspace.language,
          now: deps.clock.now(),
          schedule,
          timezone: workspace.timezone,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

const mergeSkippedDatesForWindow = ({
  existingDates,
  selectedDates,
  windowDates,
}: {
  readonly existingDates: readonly string[];
  readonly selectedDates: readonly string[];
  readonly windowDates: readonly string[];
}): readonly string[] => {
  const windowDateSet = new Set(windowDates);
  const selectedDateSet = new Set(selectedDates);

  return [
    ...new Set([
      ...existingDates.filter((date) => !windowDateSet.has(date)),
      ...windowDates.filter((date) => selectedDateSet.has(date)),
    ]),
  ].sort();
};

export const saveSlackCallScheduleSettings = async ({
  callbackId,
  deps,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackAppHomeDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.callScheduleSettings) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null) {
    return;
  }

  const schedule = await getOrCreateScheduleForSlackUser({
    deps,
    slackUserId,
    workspace,
  });
  const timeOfDay = parseCallScheduleTime(stateValues);

  if (schedule === null || timeOfDay === null) {
    return;
  }

  const now = deps.clock.now();
  const windowDates = buildCallScheduleSkipDateValues({
    now,
    timezone: workspace.timezone,
  });
  const updatedSchedule = withNextRunAt({
    after: new Date(now),
    schedule: callScheduleSchema.parse({
      ...schedule,
      enabled: parseCallScheduleEnabled(stateValues),
      excludedDates: mergeSkippedDatesForWindow({
        existingDates: schedule.excludedDates,
        selectedDates: parseCallScheduleSkippedDates(stateValues),
        windowDates,
      }),
      timeOfDay,
      timezone: workspace.timezone,
      updatedAt: now,
    }),
  });

  await deps.callScheduleRepository.upsert({ schedule: updatedSchedule });
  await publishSlackAppHome({ deps, slackTeamId, slackUserId });
};
