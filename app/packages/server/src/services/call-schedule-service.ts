import { notFoundError } from '#server/errors';
import type {
  CallScheduleRepository,
  Clock,
  IdGenerator,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { findUserProfileBySlackUserId } from '#server/services/slack-workspace-utils';
import { getWorkspaceForUser } from '#server/workspace-access';
import {
  calculateNextRunAt,
  callScheduleSchema,
  type CallSchedule,
  type UserProfile,
  type Workspace,
} from '@exe/domain';

export interface PutCallScheduleInput {
  readonly enabled: boolean;
  readonly excludedDates: readonly string[];
  readonly preNotifyMinutes: number;
  readonly timeOfDay: string;
  readonly timezone: string;
  readonly weekdays: readonly number[];
}

export interface CallScheduleService {
  readonly getForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule>;
  readonly getForSlackUser: (params: {
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule>;
  readonly putForUser: (params: {
    readonly input: PutCallScheduleInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule>;
  readonly putForSlackUser: (params: {
    readonly input: PutCallScheduleInput;
    readonly slackUserId: string;
    readonly workspaceId: string;
  }) => Promise<CallSchedule>;
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
  clock,
  idGenerator,
  timezone,
  userId,
  workspaceId,
}: {
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly timezone: string;
  readonly userId: string;
  readonly workspaceId: string;
}): CallSchedule => {
  const now = clock.now();

  return callScheduleSchema.parse({
    createdAt: now,
    enabled: true,
    excludedDates: [],
    id: idGenerator.generateId(),
    preNotifyMinutes: 10,
    timeOfDay: '09:00',
    timezone,
    updatedAt: now,
    userId,
    weekdays: [1, 2, 3, 4, 5],
    workspaceId,
  });
};

const getLinkedSlackScheduleOwner = async ({
  slackUserId,
  userProfileRepository,
  workspaceId,
  workspaceRepository,
}: {
  readonly slackUserId: string;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceId: string;
  readonly workspaceRepository: WorkspaceRepository;
}): Promise<{
  readonly userProfile: UserProfile;
  readonly workspace: Workspace;
}> => {
  const workspace = await workspaceRepository.getById({ workspaceId });

  if (workspace === null) {
    throw notFoundError(`Workspace ${workspaceId} was not found.`);
  }

  const userProfiles = await userProfileRepository.listByWorkspace({
    workspaceId,
  });
  const userProfile = findUserProfileBySlackUserId({
    slackUserId,
    userProfiles,
    workspaceId,
  });

  if (userProfile === null) {
    throw notFoundError(
      `Linked user profile for Slack user ${slackUserId} in workspace ${workspaceId} was not found.`
    );
  }

  return { userProfile, workspace };
};

const putScheduleForUser = async ({
  callScheduleRepository,
  clock,
  idGenerator,
  input,
  userId,
  workspaceId,
}: {
  readonly callScheduleRepository: CallScheduleRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly input: PutCallScheduleInput;
  readonly userId: string;
  readonly workspaceId: string;
}): Promise<CallSchedule> => {
  const existing = await callScheduleRepository.getByUser({
    userId,
    workspaceId,
  });
  const now = clock.now();
  const schedule = callScheduleSchema.parse({
    createdAt: existing?.createdAt ?? now,
    enabled: input.enabled,
    excludedDates: [...input.excludedDates],
    id: existing?.id ?? idGenerator.generateId(),
    preNotifyMinutes: input.preNotifyMinutes,
    timeOfDay: input.timeOfDay,
    timezone: input.timezone,
    updatedAt: now,
    userId,
    weekdays: [...input.weekdays],
    workspaceId,
  });
  const nextSchedule = withNextRunAt({
    after: new Date(now),
    schedule,
  });

  await callScheduleRepository.upsert({ schedule: nextSchedule });

  return nextSchedule;
};

export const createCallScheduleService = ({
  callScheduleRepository,
  clock,
  idGenerator,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly callScheduleRepository: CallScheduleRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): CallScheduleService => ({
  getForSlackUser: async ({
    slackUserId,
    workspaceId,
  }): Promise<CallSchedule> => {
    const { userProfile, workspace } = await getLinkedSlackScheduleOwner({
      slackUserId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const existing = await callScheduleRepository.getByUser({
      userId: userProfile.id,
      workspaceId,
    });

    if (existing !== null) {
      return existing;
    }

    const nextSchedule = withNextRunAt({
      after: new Date(clock.now()),
      schedule: buildDefaultSchedule({
        clock,
        idGenerator,
        timezone: workspace.timezone,
        userId: userProfile.id,
        workspaceId,
      }),
    });

    await callScheduleRepository.upsert({ schedule: nextSchedule });

    return nextSchedule;
  },
  getForUser: async ({ userId, workspaceId }): Promise<CallSchedule> => {
    const { workspace } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const existing = await callScheduleRepository.getByUser({
      userId,
      workspaceId,
    });

    if (existing !== null) {
      return existing;
    }

    const nextSchedule = withNextRunAt({
      after: new Date(clock.now()),
      schedule: buildDefaultSchedule({
        clock,
        idGenerator,
        timezone: workspace.timezone,
        userId,
        workspaceId,
      }),
    });

    await callScheduleRepository.upsert({ schedule: nextSchedule });

    return nextSchedule;
  },
  putForSlackUser: async ({
    input,
    slackUserId,
    workspaceId,
  }): Promise<CallSchedule> => {
    const { userProfile } = await getLinkedSlackScheduleOwner({
      slackUserId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    return putScheduleForUser({
      callScheduleRepository,
      clock,
      idGenerator,
      input,
      userId: userProfile.id,
      workspaceId,
    });
  },
  putForUser: async ({ input, userId, workspaceId }): Promise<CallSchedule> => {
    await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });

    return putScheduleForUser({
      callScheduleRepository,
      clock,
      idGenerator,
      input,
      userId,
      workspaceId,
    });
  },
});
