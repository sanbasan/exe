import {
  workTaskSchema,
  type ChannelEvent,
  type Language,
  type TaskStatus,
  type WorkTask,
} from '@exe/domain';
import { slackActionIds } from '@exe/slack';

const MAX_TASK_TITLE_LENGTH = 120;
const SLACK_DOCUMENT_ID_PATTERN = /[^A-Za-z0-9_-]/gu;
const SLACK_USER_MENTION_PATTERN = /<@([^|>]+)(?:\|[^>]*)?>/gu;

export const buildSlackTaskId = ({
  channelId,
  messageTs,
}: {
  readonly channelId: string;
  readonly messageTs: string;
}): string =>
  `slack_${channelId}_${messageTs}`.replace(SLACK_DOCUMENT_ID_PATTERN, '_');

export const extractMentionedSlackUserIds = (text: string): readonly string[] =>
  [...text.matchAll(SLACK_USER_MENTION_PATTERN)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);

export const getTaskTitleFromSlackText = (text: string): string | null => {
  const normalized = text
    .replace(SLACK_USER_MENTION_PATTERN, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= MAX_TASK_TITLE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TASK_TITLE_LENGTH - 3)}...`;
};

export const getAssigneeSlackUserIds = ({
  botUserId,
  slackUserId,
  text,
}: {
  readonly botUserId: string;
  readonly slackUserId: string;
  readonly text: string;
}): readonly string[] => {
  const assigneeSlackUserIds = extractMentionedSlackUserIds(text).filter(
    (candidate) => candidate !== botUserId && candidate !== slackUserId
  );

  return assigneeSlackUserIds.length === 0
    ? [slackUserId]
    : [...new Set(assigneeSlackUserIds)];
};

export const getActionStatus = (actionId: string): TaskStatus | null => {
  switch (actionId) {
    case slackActionIds.cancelTask:
      return 'cancelled';
    case slackActionIds.completeTask:
      return 'completed';
    case slackActionIds.reopenTask:
      return 'active';
    default:
      return null;
  }
};

export const buildWorkTaskWithStatus = ({
  now,
  status,
  task,
}: {
  readonly now: string;
  readonly status: TaskStatus;
  readonly task: WorkTask;
}): WorkTask =>
  workTaskSchema.parse({
    ...task,
    completedAt: status === 'completed' ? now : null,
    status,
    updatedAt: now,
  });

export const buildChannelEventForTask = ({
  id,
  language,
  now,
  task,
}: {
  readonly id: string;
  readonly language: Language;
  readonly now: string;
  readonly task: WorkTask;
}): ChannelEvent | null => {
  if (task.channelId === undefined) {
    return null;
  }

  return {
    body: task.title,
    channelId: task.channelId,
    createdAt: now,
    id,
    occurredAt: now,
    source: 'slack',
    sourceRef: task.id,
    title: language === 'ja' ? 'タスク作成' : 'Task created',
    type: 'task_created',
    workspaceId: task.workspaceId,
  };
};
