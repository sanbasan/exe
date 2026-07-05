// Auto-add task participants (assignees / requesters) to the task's channel
// assignees. Add-only: removal stays with the explicit, permission-checked
// paths (channel owner editor, channel PATCH). On edits, only users newly
// added to the task are considered, so a channel assignee explicitly removed
// by an owner editor is not resurrected by an unrelated re-save of the task.
import type { ChannelRepository, Clock } from '#server/ports';
import { reportServerError } from '#server/utils';
import { channelSchema, type Task } from '@exe/domain';

const getTaskParticipants = (task: Task): readonly string[] => [
  ...new Set([...task.assigneeSlackUserIds, ...task.requesterSlackUserIds]),
];

const getNewParticipants = ({
  previousTask,
  task,
}: {
  readonly previousTask?: Task;
  readonly task: Task;
}): readonly string[] => {
  const participants = getTaskParticipants(task);

  if (previousTask === undefined || previousTask.channelId !== task.channelId) {
    return participants;
  }

  const previousParticipants = getTaskParticipants(previousTask);

  return participants.filter(
    (slackUserId) => !previousParticipants.includes(slackUserId)
  );
};

export const syncChannelAssigneesForTask = async ({
  channelRepository,
  clock,
  previousTask,
  task,
}: {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly previousTask?: Task;
  readonly task: Task;
}): Promise<void> => {
  const channelId = task.channelId;

  if (channelId === undefined) {
    return;
  }

  const newParticipants = getNewParticipants({
    ...(previousTask === undefined ? {} : { previousTask }),
    task,
  });

  if (newParticipants.length === 0) {
    return;
  }

  const channel = await channelRepository.getById({
    channelId,
    workspaceId: task.workspaceId,
  });

  if (channel?.status !== 'active') {
    return;
  }

  const missingAssignees = newParticipants.filter(
    (slackUserId) => !channel.assigneeSlackUserIds.includes(slackUserId)
  );

  if (missingAssignees.length === 0) {
    return;
  }

  await channelRepository.upsert({
    channel: channelSchema.parse({
      ...channel,
      assigneeSlackUserIds: [
        ...channel.assigneeSlackUserIds,
        ...missingAssignees,
      ],
      updatedAt: clock.now(),
    }),
  });
};

export const syncChannelAssigneesForTaskBestEffort = (params: {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly previousTask?: Task;
  readonly task: Task;
}): Promise<void> =>
  syncChannelAssigneesForTask(params).catch((error: unknown) =>
    reportServerError({
      context: { route: 'channel-assignee-sync' },
      error,
    })
  );
