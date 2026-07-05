import { forbiddenError, notFoundError } from '#server/errors';
import type {
  Clock,
  ChannelRepository,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { getWorkspaceForUser } from '#server/workspace-access';
import {
  assertCanAccessChannel,
  type ChannelVisibility,
} from './channel-access';
import { syncChannelAssigneesForTaskBestEffort } from './channel-assignee-sync';
import type { ChannelVisibilityService } from './channel-visibility-service';
import {
  applyTaskPatch,
  getOpenFollowUpTasksForAssignee,
  getOpenWorkTasksForAssignee,
  getOpenWorkTasksForRequester,
  type FollowUpTask,
  type Task,
  type TaskPatch,
  type Workspace,
  type WorkTask,
} from '@exe/domain';

export interface TaskService {
  readonly getTaskForUser: (params: {
    readonly taskId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Task>;
  readonly listFollowUpsForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly FollowUpTask[]>;
  readonly listRequestedWorkTasksForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly WorkTask[]>;
  readonly listWorkTasksForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly WorkTask[]>;
  readonly patchTaskForUser: (params: {
    readonly patch: TaskPatch;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Task>;
}

export const createTaskService = ({
  channelRepository,
  channelVisibility,
  clock,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly clock: Clock;
  readonly channelRepository: ChannelRepository;
  readonly channelVisibility: ChannelVisibilityService;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): TaskService => {
  const assertTaskParticipant = ({
    slackUserId,
    task,
  }: {
    readonly slackUserId: string;
    readonly task: Task;
  }): void => {
    if (
      !task.assigneeSlackUserIds.includes(slackUserId) &&
      !task.requesterSlackUserIds.includes(slackUserId)
    ) {
      throw forbiddenError(
        `Slack user ${slackUserId} cannot access this task.`
      );
    }
  };

  const assertPatchChannelVisible = async ({
    channelId,
    visibility,
    workspace,
  }: {
    readonly channelId?: string;
    readonly visibility: ChannelVisibility;
    readonly workspace: Workspace;
  }): Promise<void> => {
    if (channelId === undefined) {
      return;
    }

    const channel = await channelRepository.getById({
      channelId,
      workspaceId: workspace.id,
    });

    if (channel === null) {
      throw notFoundError(`Channel ${channelId} was not found.`);
    }

    assertCanAccessChannel({ channel, visibility });
  };

  const listTasksForUser = async ({
    userId,
    workspaceId,
  }: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<{
    readonly slackUserId: string;
    readonly tasks: readonly Task[];
  }> => {
    const { linkedSlackUser } = await getWorkspaceForUser({
      userId,
      userProfileRepository,
      workspaceId,
      workspaceRepository,
    });
    const tasks = await taskRepository.listByAssignee({
      slackUserId: linkedSlackUser.slackUserId,
      workspaceId,
    });

    return { slackUserId: linkedSlackUser.slackUserId, tasks };
  };

  return {
    getTaskForUser: async ({ taskId, userId, workspaceId }): Promise<Task> => {
      const { linkedSlackUser } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const task = await taskRepository.getById({ taskId, workspaceId });

      if (task === null) {
        throw notFoundError(`Task ${taskId} was not found.`);
      }

      assertTaskParticipant({ slackUserId: linkedSlackUser.slackUserId, task });

      return task;
    },
    listFollowUpsForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly FollowUpTask[]> => {
      const { slackUserId, tasks } = await listTasksForUser({
        userId,
        workspaceId,
      });

      return getOpenFollowUpTasksForAssignee({ slackUserId, tasks });
    },
    listRequestedWorkTasksForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly WorkTask[]> => {
      const { linkedSlackUser } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const tasks = await taskRepository.listByRequester({
        slackUserId: linkedSlackUser.slackUserId,
        workspaceId,
      });

      return getOpenWorkTasksForRequester({
        slackUserId: linkedSlackUser.slackUserId,
        tasks,
      });
    },
    listWorkTasksForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly WorkTask[]> => {
      const { slackUserId, tasks } = await listTasksForUser({
        userId,
        workspaceId,
      });

      return getOpenWorkTasksForAssignee({ slackUserId, tasks });
    },
    patchTaskForUser: async ({ patch, userId, workspaceId }): Promise<Task> => {
      const { linkedSlackUser, workspace } = await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const task = await taskRepository.getById({
        taskId: patch.taskId,
        workspaceId,
      });

      if (task === null) {
        throw notFoundError(`Task ${patch.taskId} was not found.`);
      }

      assertTaskParticipant({ slackUserId: linkedSlackUser.slackUserId, task });
      const visibility = await channelVisibility.getVisibilityForSlackUser({
        slackUserId: linkedSlackUser.slackUserId,
        workspace,
      });

      await assertPatchChannelVisible({
        ...(patch.after.channelId === undefined
          ? {}
          : { channelId: patch.after.channelId }),
        visibility,
        workspace,
      });

      const updatedTask = applyTaskPatch({
        now: clock.now(),
        patch,
        task,
      });

      await taskRepository.update({ task: updatedTask });
      await syncChannelAssigneesForTaskBestEffort({
        channelRepository,
        clock,
        previousTask: task,
        task: updatedTask,
      });

      return updatedTask;
    },
  };
};
