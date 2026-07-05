import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import { formatSlackTimeInput } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getOverdueText = dispatcher<
  Language,
  [taskUrl: string, title: string],
  string
>({
  en: (taskUrl, title) =>
    `<${taskUrl}|${title}> is overdue :hourglass_flowing_sand:`,
  ja: (taskUrl, title) =>
    `<${taskUrl}|${title}>の期限切れです :hourglass_flowing_sand:`,
});

const getFallbackText = dispatcher<
  Language,
  [taskUrl: string, title: string],
  string
>({
  en: (taskUrl, title) => `Overdue: <${taskUrl}|${title}>`,
  ja: (taskUrl, title) => `期限切れ: <${taskUrl}|${title}>`,
});

const getDueAtLabel = dispatcher<Language, string>({
  en: 'Due:',
  ja: '期限:',
});

const getCompleteText = dispatcher<Language, string>({
  en: 'Complete :sparkles:',
  ja: '完了 :sparkles:',
});

const getStartCallText = dispatcher<Language, string>({
  en: 'Ask exe :telephone_receiver:',
  ja: 'exe に相談 :telephone_receiver:',
});

export const buildOverdueTaskNotificationFallbackText = ({
  language,
  taskUrl,
  title,
}: {
  readonly language: Language;
  readonly taskUrl: string;
  readonly title: string;
}): string => getFallbackText(language)(taskUrl, title);

export const buildOverdueTaskNotificationBlocks = ({
  assigneeSlackUserIds,
  dueAt,
  language,
  taskId,
  taskUrl,
  timezone,
  title,
}: {
  readonly assigneeSlackUserIds: readonly string[];
  readonly dueAt: string;
  readonly language: Language;
  readonly taskId: string;
  readonly taskUrl: string;
  readonly timezone: string;
  readonly title: string;
}): readonly KnownBlock[] => {
  const mentions = assigneeSlackUserIds.map((id) => `<@${id}>`).join(' ');
  const dueTime =
    formatSlackTimeInput({ isoDateTime: dueAt, timezone }) ?? dueAt;

  return [
    {
      block_id: `${slackBlockIds.overdueTask}.message`,
      text: {
        text: `${mentions}\n${getOverdueText(language)(taskUrl, title)}`,
        type: 'mrkdwn',
      },
      type: 'section',
    },
    {
      elements: [
        {
          text: `${getDueAtLabel(language)} ${dueTime}`,
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
    {
      block_id: `${slackBlockIds.overdueTask}.actions`,
      elements: [
        {
          action_id: slackActionIds.completeTask,
          style: 'primary',
          text: {
            text: getCompleteText(language),
            type: 'plain_text',
          },
          type: 'button',
          value: taskId,
        },
        {
          action_id: slackActionIds.startTaskChangeCall,
          text: {
            text: getStartCallText(language),
            type: 'plain_text',
          },
          type: 'button',
          value: taskId,
        },
      ],
      type: 'actions',
    },
  ];
};
