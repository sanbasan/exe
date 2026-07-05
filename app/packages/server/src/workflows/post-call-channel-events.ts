import type { CallWorkflowDeps } from './deps';
import {
  channelEventSchema,
  isFollowUpTask,
  type CallSession,
  type Task,
} from '@exe/domain';

export const createTaskChannelEvent = async ({
  deps,
  session,
  task,
}: {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly task: Task;
}): Promise<void> => {
  if (task.channelId === undefined) {
    return;
  }

  await deps.channelEventRepository.create({
    event: channelEventSchema.parse({
      body:
        isFollowUpTask(task) && task.followUpAnswer !== undefined
          ? task.followUpAnswer
          : task.title,
      channelId: task.channelId,
      createdAt: deps.clock.now(),
      id: deps.idGenerator.generateId(),
      occurredAt: deps.clock.now(),
      source: 'call',
      sourceRef: session.id,
      title: task.title,
      type:
        isFollowUpTask(task) && task.followUpAnswer !== undefined
          ? 'follow_up_task_answered'
          : 'task_updated',
      workspaceId: session.workspaceId,
    }),
  });
};
