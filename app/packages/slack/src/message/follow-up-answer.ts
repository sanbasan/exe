import { dispatcher } from '#slack/utils/dispatcher';
import { isFollowUpTask, type Language, type Task } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getHeading = dispatcher<Language, string>({
  en: 'Follow-up answered',
  ja: '確認依頼に回答がありました',
});

const getQuestionLabel = dispatcher<Language, string>({
  en: 'Question',
  ja: '確認内容',
});

const getAnswerLabel = dispatcher<Language, string>({
  en: 'Answer',
  ja: '回答',
});

const getOpenTaskText = dispatcher<Language, string>({
  en: 'Open task',
  ja: 'タスクを開く',
});

const getGenericText = dispatcher<Language, string>({
  en: 'A follow-up request was answered.',
  ja: '確認依頼に回答がありました。',
});

const normalizeText = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

const sectionBlock = (text: string): KnownBlock => ({
  text: {
    text,
    type: 'mrkdwn',
  },
  type: 'section',
});

const actionsBlock = ({
  language,
  taskUrl,
}: {
  readonly language: Language;
  readonly taskUrl?: string;
}): readonly KnownBlock[] =>
  taskUrl === undefined
    ? []
    : [
        {
          elements: [
            {
              text: {
                text: getOpenTaskText(language),
                type: 'plain_text',
              },
              type: 'button',
              url: taskUrl,
            },
          ],
          type: 'actions',
        },
      ];

export const buildFollowUpAnswerFallbackText = ({
  language,
  task,
}: {
  readonly language: Language;
  readonly task?: Task;
}): string => {
  if (task !== undefined && isFollowUpTask(task)) {
    return `${getHeading(language)}: ${task.title}\n\n${
      task.followUpAnswer ?? ''
    }`;
  }

  return getGenericText(language);
};

export const buildFollowUpAnswerBlocks = ({
  language,
  task,
  taskUrl,
}: {
  readonly language: Language;
  readonly task?: Task;
  readonly taskUrl?: string;
}): readonly KnownBlock[] => {
  if (task === undefined || !isFollowUpTask(task)) {
    return [
      sectionBlock(`*${getHeading(language)}*\n${getGenericText(language)}`),
    ];
  }

  return [
    sectionBlock(`*${getHeading(language)}*\n${task.title}`),
    sectionBlock(
      `*${getQuestionLabel(language)}*\n${normalizeText(task.followUpQuestion)}`
    ),
    sectionBlock(
      `*${getAnswerLabel(language)}*\n${normalizeText(
        task.followUpAnswer ?? ''
      )}`
    ),
    ...actionsBlock({
      language,
      ...(taskUrl === undefined ? {} : { taskUrl }),
    }),
  ];
};
