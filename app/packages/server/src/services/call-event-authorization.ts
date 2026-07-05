import {
  forbiddenError,
  invalidRequestError,
  notFoundError,
} from '#server/errors';
import type { ChannelRepository, TaskRepository } from '#server/ports';
import {
  assertCanAccessChannel,
  type ChannelVisibility,
} from './channel-access';
import type { ChannelVisibilityService } from './channel-visibility-service';
import type {
  CallEventPayload,
  CallEventType,
  FollowUpTaskDraft,
  Task,
  TaskPatch,
  Workspace,
  WorkTaskDraft,
} from '@exe/domain';

const getTaskOrThrow = async ({
  taskId,
  taskRepository,
  workspaceId,
}: {
  readonly taskId: string;
  readonly taskRepository: TaskRepository;
  readonly workspaceId: string;
}): Promise<Task> => {
  const task = await taskRepository.getById({ taskId, workspaceId });

  if (task === null) {
    throw notFoundError(`Task ${taskId} was not found.`);
  }

  return task;
};

const assertTaskIsInCallAgenda = ({
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
      `Slack user ${slackUserId} cannot approve changes for task ${task.id}.`
    );
  }
};

const assertChannelVisible = async ({
  channelId,
  channelRepository,
  visibility,
  workspace,
}: {
  readonly channelId?: string;
  readonly channelRepository: ChannelRepository;
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

const assertPatchAuthorized = async ({
  channelRepository,
  patch,
  slackUserId,
  taskRepository,
  visibility,
  workspace,
}: {
  readonly patch: TaskPatch;
  readonly channelRepository: ChannelRepository;
  readonly slackUserId: string;
  readonly taskRepository: TaskRepository;
  readonly visibility: ChannelVisibility;
  readonly workspace: Workspace;
}): Promise<void> => {
  const task = await getTaskOrThrow({
    taskId: patch.taskId,
    taskRepository,
    workspaceId: workspace.id,
  });

  assertTaskIsInCallAgenda({ slackUserId, task });
  await assertChannelVisible({
    ...(patch.after.channelId === undefined
      ? {}
      : { channelId: patch.after.channelId }),
    channelRepository,
    visibility,
    workspace,
  });
};

const assertDraftAuthorized = async ({
  channelRepository,
  draft,
  slackUserId,
  taskRepository,
  visibility,
  workspace,
}: {
  readonly draft: FollowUpTaskDraft;
  readonly channelRepository: ChannelRepository;
  readonly slackUserId: string;
  readonly taskRepository: TaskRepository;
  readonly visibility: ChannelVisibility;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (!draft.requesterSlackUserIds.includes(slackUserId)) {
    throw forbiddenError(
      `Slack user ${slackUserId} cannot create a follow-up for another requester.`
    );
  }

  if (
    draft.assigneeSlackUserIds === undefined ||
    draft.assigneeSlackUserIds.length === 0
  ) {
    throw invalidRequestError('Follow-up draft requires assigneeSlackUserIds.');
  }

  if (draft.sourceTaskId !== undefined) {
    const sourceTask = await getTaskOrThrow({
      taskId: draft.sourceTaskId,
      taskRepository,
      workspaceId: workspace.id,
    });

    assertTaskIsInCallAgenda({ slackUserId, task: sourceTask });
  }

  await assertChannelVisible({
    ...(draft.channelId === undefined ? {} : { channelId: draft.channelId }),
    channelRepository,
    visibility,
    workspace,
  });
};

const assertWorkTaskDraftAuthorized = async ({
  channelRepository,
  draft,
  slackUserId,
  visibility,
  workspace,
}: {
  readonly draft: WorkTaskDraft;
  readonly channelRepository: ChannelRepository;
  readonly slackUserId: string;
  readonly visibility: ChannelVisibility;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (!draft.requesterSlackUserIds.includes(slackUserId)) {
    throw forbiddenError(
      `Slack user ${slackUserId} cannot create a task for another requester.`
    );
  }

  if (draft.assigneeSlackUserIds.length === 0) {
    throw invalidRequestError('Work task draft requires assigneeSlackUserIds.');
  }

  await assertChannelVisible({
    ...(draft.channelId === undefined ? {} : { channelId: draft.channelId }),
    channelRepository,
    visibility,
    workspace,
  });
};

export const assertUserCallEventAuthorized = async ({
  channelRepository,
  channelVisibility,
  payload,
  slackUserId,
  taskRepository,
  type,
  workspace,
}: {
  readonly channelVisibility: ChannelVisibilityService;
  readonly payload: CallEventPayload;
  readonly channelRepository: ChannelRepository;
  readonly slackUserId: string;
  readonly taskRepository: TaskRepository;
  readonly type: CallEventType;
  readonly workspace: Workspace;
}): Promise<void> => {
  const visibility = await channelVisibility.getVisibilityForSlackUser({
    slackUserId,
    workspace,
  });

  if (type === 'task_patch_approved') {
    if (!('patches' in payload)) {
      throw invalidRequestError('Call event payload does not match type.');
    }

    await Promise.all(
      payload.patches.map((patch) =>
        assertPatchAuthorized({
          channelRepository,
          patch,
          slackUserId,
          taskRepository,
          visibility,
          workspace,
        })
      )
    );

    return;
  }

  if (type === 'follow_up_task_draft_approved') {
    if (!('drafts' in payload)) {
      throw invalidRequestError('Call event payload does not match type.');
    }

    await Promise.all(
      payload.drafts.map((draft) =>
        assertDraftAuthorized({
          channelRepository,
          draft,
          slackUserId,
          taskRepository,
          visibility,
          workspace,
        })
      )
    );

    return;
  }

  if (type === 'work_task_draft_approved') {
    if (!('workTaskDrafts' in payload)) {
      throw invalidRequestError('Call event payload does not match type.');
    }

    await Promise.all(
      payload.workTaskDrafts.map((draft) =>
        assertWorkTaskDraftAuthorized({
          channelRepository,
          draft,
          slackUserId,
          visibility,
          workspace,
        })
      )
    );

    return;
  }

  throw invalidRequestError('Call event type is not user writable.');
};
