import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { buildSlackTaskMessageBlocks } from './slack-task-message-blocks';
import {
  workTaskSchema,
  type Task,
  type WorkTask,
  type Workspace,
} from '@exe/domain';
import { localDateTimeToIso } from '@exe/slack';

interface UpdatedTaskParams {
  readonly assigneeSlackUserIds: readonly string[];
  readonly dueAt: string | null;
  readonly now: string;
  readonly requesterSlackUserIds: readonly string[];
  readonly task: WorkTask;
  readonly title: string;
}

interface UpdateTaskMessageDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

export type DueAtResolution =
  | { readonly dueAt: string | null; readonly status: 'ok' }
  | { readonly status: 'invalid' };

export const buildUpdatedTask = ({
  assigneeSlackUserIds,
  dueAt,
  now,
  requesterSlackUserIds,
  task,
  title,
}: UpdatedTaskParams): WorkTask =>
  workTaskSchema.parse({
    assigneeSlackUserIds: [...new Set(assigneeSlackUserIds)],
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
    ...(dueAt === null ? {} : { dueAt }),
    id: task.id,
    kind: 'work',
    ...(task.messageTs === undefined ? {} : { messageTs: task.messageTs }),
    requesterSlackUserIds: [...new Set(requesterSlackUserIds)],
    status: task.status,
    title,
    updatedAt: now,
    workspaceId: task.workspaceId,
  });

export const resolveSubmittedDueAt = ({
  dueDate,
  dueTime,
  timezone,
}: {
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly timezone: string;
}): DueAtResolution => {
  if (dueDate === null) {
    return { dueAt: null, status: 'ok' };
  }

  const dueAt = localDateTimeToIso({
    date: dueDate,
    ...(dueTime === null ? {} : { time: dueTime }),
    timezone,
  });

  return dueAt === null ? { status: 'invalid' } : { dueAt, status: 'ok' };
};

export const updateSlackTaskMessage = async ({
  deps,
  previousDueAt,
  task,
  workspace,
}: {
  readonly deps: UpdateTaskMessageDeps;
  readonly previousDueAt?: string;
  readonly task: Task;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (task.channelId === undefined || task.messageTs === undefined) {
    return;
  }

  const channelId = task.channelId;
  const messageTs = task.messageTs;

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }): Promise<void> => {
      await deps.slackGateway.updateMessage({
        blocks: await buildSlackTaskMessageBlocks({
          botToken,
          language: workspace.language,
          ...(previousDueAt === undefined ? {} : { previousDueAt }),
          slackGateway: deps.slackGateway,
          task,
          timezone: workspace.timezone,
        }),
        botToken,
        channelId,
        messageTs,
        text: task.title,
      });
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
