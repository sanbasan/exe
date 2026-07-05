import { slackMessageUrl } from '#slack/utils/slack-link';
import type { WorkTask } from '@exe/domain';

const SLACK_TASK_ID_PATTERN = /^slack_[^_]+_(\d+)_(\d+)$/u;

const inferThreadTsFromTaskId = (taskId: string): string | undefined => {
  const match = SLACK_TASK_ID_PATTERN.exec(taskId);
  const seconds = match?.[1];
  const fraction = match?.[2];

  return seconds === undefined || fraction === undefined
    ? undefined
    : `${seconds}.${fraction}`;
};

const getTaskThreadTs = (task: WorkTask): string | undefined =>
  task.threadTs ?? inferThreadTsFromTaskId(task.id);

export const slackTaskLinkUrl = ({
  slackDomain,
  task,
}: {
  readonly slackDomain: string;
  readonly task: WorkTask;
}): string | null => {
  if (task.channelId === undefined || task.messageTs === undefined) {
    return null;
  }

  const threadTs = getTaskThreadTs(task);

  return slackMessageUrl({
    channelId: task.channelId,
    messageTs: task.messageTs,
    slackDomain,
    ...(threadTs === undefined ? {} : { threadTs }),
  });
};
