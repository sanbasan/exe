/* eslint-disable max-lines -- Task graph service keeps dependency edges, card posting, and blocker calls as one contract. */
import { invalidRequestError, notFoundError } from '#server/errors';
import type { GBrainIngestGateway } from '#server/gateways';
import type {
  Clock,
  DeviceTokenRepository,
  IdGenerator,
  NotificationGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { reportServerError } from '#server/utils';
import { getWorkspaceForUser } from '#server/workspace-access';
import { startAutoCall } from './auto-call';
import type { CallSessionService } from './call-session-types';
import { ingestTaskPagesBestEffort } from './task-gbrain';
import {
  addTaskDependency,
  createWorkTaskFromDraft,
  isWorkTask,
  removeTaskDependency,
  shouldTriggerBlockerCall,
  workTaskSchema,
  type Task,
  type Workspace,
  type WorkTask,
} from '@exe/domain';

export interface SlackThreadTarget {
  readonly channelId: string;
  readonly threadTs?: string;
}

export interface CreateWorkTaskInput {
  readonly assigneeSlackUserIds: readonly string[];
  readonly channelId?: string;
  readonly description?: string;
  readonly dueAt?: string;
  readonly requesterSlackUserIds?: readonly string[];
  readonly sourceMeetingId?: string;
  readonly startAt?: string;
  readonly title: string;
}

export interface TaskGraphService {
  // Adds the edge "blocker → blocked" on both task documents, posts Slack
  // dependency notices (into extraTargets plus both tasks' own threads),
  // projects both tasks to GBrain, and places the automatic blocker call when
  // the blocker crosses the open-dependent threshold. Not user-scoped: used
  // by the meeting pipeline; access-checked variants wrap it.
  readonly applyDependency: (params: {
    readonly blockedTaskId: string;
    readonly blockerTaskId: string;
    readonly extraSlackTargets?: readonly SlackThreadTarget[];
    readonly workspaceId: string;
  }) => Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }>;
  readonly addDependencyForUser: (params: {
    readonly blockedTaskId: string;
    readonly blockerTaskId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }>;
  readonly createWorkTask: (params: {
    readonly input: CreateWorkTaskInput;
    readonly requesterSlackUserId?: string;
    readonly workspaceId: string;
  }) => Promise<WorkTask>;
  readonly createWorkTaskForUser: (params: {
    readonly input: CreateWorkTaskInput;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<WorkTask>;
  readonly listAllForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Task[]>;
  readonly removeDependencyForUser: (params: {
    readonly blockedTaskId: string;
    readonly blockerTaskId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }>;
}

const taskThreadTarget = (task: WorkTask): SlackThreadTarget | null => {
  if (task.channelId === undefined) {
    return null;
  }

  const threadTs = task.threadTs ?? task.messageTs;

  return {
    channelId: task.channelId,
    ...(threadTs === undefined ? {} : { threadTs }),
  };
};

const dedupeTargets = (
  targets: readonly (SlackThreadTarget | null)[]
): readonly SlackThreadTarget[] => {
  const keyOf = (target: SlackThreadTarget): string =>
    `${target.channelId}:${target.threadTs ?? ''}`;
  const present = targets.filter(
    (target): target is SlackThreadTarget => target !== null
  );

  return present.filter(
    (target, index) =>
      present.findIndex((other) => keyOf(other) === keyOf(target)) === index
  );
};

export const createTaskGraphService = ({
  callSessionService,
  clock,
  deviceTokenRepository,
  gbrainIngestGateway,
  idGenerator,
  notificationGateway,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly callSessionService: CallSessionService;
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly gbrainIngestGateway: GBrainIngestGateway;
  readonly idGenerator: IdGenerator;
  readonly notificationGateway: NotificationGateway;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): TaskGraphService => {
  const getWorkspaceOrThrow = async (
    workspaceId: string
  ): Promise<Workspace> => {
    const workspace = await workspaceRepository.getById({ workspaceId });

    if (workspace === null) {
      throw notFoundError('Workspace not found.');
    }

    return workspace;
  };

  const getWorkTaskOrThrow = async ({
    taskId,
    workspaceId,
  }: {
    readonly taskId: string;
    readonly workspaceId: string;
  }): Promise<WorkTask> => {
    const task = await taskRepository.getById({ taskId, workspaceId });

    if (task === null) {
      throw notFoundError(`Task ${taskId} not found.`);
    }

    if (!isWorkTask(task)) {
      throw invalidRequestError(
        'Dependencies are only supported between work tasks.'
      );
    }

    return task;
  };

  const projectToGBrainBestEffort = async ({
    tasks,
    workspaceId,
  }: {
    readonly tasks: readonly Task[];
    readonly workspaceId: string;
  }): Promise<void> => {
    if (!gbrainIngestGateway.isEnabled()) {
      return;
    }
    const allTasks = await taskRepository
      .listByWorkspace({ workspaceId })
      .catch((): readonly Task[] => []);
    const tasksById = new Map(allTasks.map((task) => [task.id, task]));

    ingestTaskPagesBestEffort({
      gbrainIngestGateway,
      tasks,
      tasksById,
      workspaceId,
    });
  };

  const maybeTriggerBlockerCall = async ({
    blocker,
    workspace,
  }: {
    readonly blocker: WorkTask;
    readonly workspace: Workspace;
  }): Promise<void> => {
    const allTasks = await taskRepository.listByWorkspace({
      workspaceId: workspace.id,
    });
    const tasksById = new Map(
      allTasks.filter(isWorkTask).map((task) => [task.id, task])
    );

    if (!shouldTriggerBlockerCall({ task: blocker, tasksById })) {
      return;
    }

    const assigneeSlackUserId = blocker.assigneeSlackUserIds[0];

    if (assigneeSlackUserId === undefined) {
      return;
    }

    // Mark first so a failed push never re-fires on the next dependency edit.
    const markedBlocker = workTaskSchema.parse({
      ...blocker,
      blockerCallAt: clock.now(),
    });

    await taskRepository.update({ task: markedBlocker });
    await startAutoCall({
      deps: {
        callSessionService,
        deviceTokenRepository,
        notificationGateway,
        userProfileRepository,
      },
      focusTaskId: blocker.id,
      slackUserId: assigneeSlackUserId,
      trigger: 'blocker',
      workspace,
    });
  };

  const applyDependency = async ({
    blockedTaskId,
    blockerTaskId,
    extraSlackTargets = [],
    workspaceId,
  }: {
    readonly blockedTaskId: string;
    readonly blockerTaskId: string;
    readonly extraSlackTargets?: readonly SlackThreadTarget[];
    readonly workspaceId: string;
  }): Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }> => {
    const [workspace, blockerTask, blockedTask] = await Promise.all([
      getWorkspaceOrThrow(workspaceId),
      getWorkTaskOrThrow({ taskId: blockerTaskId, workspaceId }),
      getWorkTaskOrThrow({ taskId: blockedTaskId, workspaceId }),
    ]);
    const { blocked, blocker } = addTaskDependency({
      blocked: blockedTask,
      blocker: blockerTask,
      now: clock.now(),
    });

    await Promise.all([
      taskRepository.update({ task: blocker }),
      taskRepository.update({ task: blocked }),
    ]);

    const targets = dedupeTargets([
      ...extraSlackTargets,
      taskThreadTarget(blocker),
      taskThreadTarget(blocked),
    ]);

    await notificationGateway
      .sendTaskDependencyNotices({
        blockedTitle: blocked.title,
        blockerTitle: blocker.title,
        targets,
        workspace,
      })
      .catch((error: unknown) => {
        void reportServerError({
          context: { route: 'task-graph/dependency-notice' },
          error,
        });
      });

    if (gbrainIngestGateway.isEnabled()) {
      void gbrainIngestGateway
        .extractFacts({
          text:
            workspace.language === 'ja'
              ? `タスク「${blocked.title}」はタスク「${blocker.title}」にブロックされている(依存関係が登録された)。`
              : `Task "${blocked.title}" is blocked by task "${blocker.title}" (dependency recorded).`,
          workspaceId,
        })
        .catch((error: unknown) => {
          void reportServerError({
            context: { route: 'task-graph/dependency-facts' },
            error,
          });
        });
    }

    await projectToGBrainBestEffort({
      tasks: [blocker, blocked],
      workspaceId,
    });
    await maybeTriggerBlockerCall({ blocker, workspace }).catch(
      (error: unknown) => {
        void reportServerError({
          context: { route: 'task-graph/blocker-call' },
          error,
        });
      }
    );

    return { blocked, blocker };
  };

  const postTaskCardBestEffort = ({
    task,
    workspace,
  }: {
    readonly task: WorkTask;
    readonly workspace: Workspace;
  }): Promise<WorkTask> => {
    if (task.channelId === undefined) {
      return Promise.resolve(task);
    }

    return notificationGateway
      .sendTaskCardToChannel({ channelId: task.channelId, task, workspace })
      .then(async ({ messageTs }): Promise<WorkTask> => {
        const persisted = workTaskSchema.parse({ ...task, messageTs });

        await taskRepository.update({ task: persisted });

        return persisted;
      })
      .catch((error: unknown): WorkTask => {
        void reportServerError({
          context: { route: 'task-graph/create-card' },
          error,
        });

        return task;
      });
  };

  const createWorkTask = async ({
    input,
    requesterSlackUserId,
    workspaceId,
  }: {
    readonly input: CreateWorkTaskInput;
    readonly requesterSlackUserId?: string;
    readonly workspaceId: string;
  }): Promise<WorkTask> => {
    const workspace = await getWorkspaceOrThrow(workspaceId);
    const requesterSlackUserIds =
      input.requesterSlackUserIds ??
      (requesterSlackUserId === undefined ? [] : [requesterSlackUserId]);
    const task = createWorkTaskFromDraft({
      draft: {
        assigneeSlackUserIds: [...input.assigneeSlackUserIds],
        ...(input.channelId === undefined
          ? {}
          : { channelId: input.channelId }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
        requesterSlackUserIds: [...requesterSlackUserIds],
        title: input.title,
      },
      id: idGenerator.generateId(),
      now: clock.now(),
      ...(input.sourceMeetingId === undefined
        ? {}
        : { sourceMeetingId: input.sourceMeetingId }),
      ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
      workspaceId,
    });

    await taskRepository.create({ task });

    const persisted = await postTaskCardBestEffort({ task, workspace });

    await projectToGBrainBestEffort({
      tasks: [persisted],
      workspaceId,
    });

    return persisted;
  };

  return {
    addDependencyForUser: async ({
      blockedTaskId,
      blockerTaskId,
      userId,
      workspaceId,
    }): Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return applyDependency({ blockedTaskId, blockerTaskId, workspaceId });
    },
    applyDependency,
    createWorkTask,
    createWorkTaskForUser: async ({
      input,
      userId,
      workspaceId,
    }): Promise<WorkTask> => {
      const { linkedSlackUser } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return createWorkTask({
        input,
        requesterSlackUserId: linkedSlackUser.slackUserId,
        workspaceId,
      });
    },
    listAllForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly Task[]> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return taskRepository.listByWorkspace({ workspaceId });
    },
    removeDependencyForUser: async ({
      blockedTaskId,
      blockerTaskId,
      userId,
      workspaceId,
    }): Promise<{ readonly blocked: WorkTask; readonly blocker: WorkTask }> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const [blockerTask, blockedTask] = await Promise.all([
        getWorkTaskOrThrow({ taskId: blockerTaskId, workspaceId }),
        getWorkTaskOrThrow({ taskId: blockedTaskId, workspaceId }),
      ]);
      const { blocked, blocker } = removeTaskDependency({
        blocked: blockedTask,
        blocker: blockerTask,
        now: clock.now(),
      });

      await Promise.all([
        taskRepository.update({ task: blocker }),
        taskRepository.update({ task: blocked }),
      ]);
      await projectToGBrainBestEffort({
        tasks: [blocker, blocked],
        workspaceId,
      });

      return { blocked, blocker };
    },
  };
};
