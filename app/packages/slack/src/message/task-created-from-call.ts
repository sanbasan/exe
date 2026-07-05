import { formatSlackDateTime } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getCreatedFromCallText = dispatcher<
  Language,
  [sessionDateTime: string, speakerMention: string, taskCount: number],
  string
>({
  en: (sessionDateTime, speakerMention, taskCount) =>
    taskCount === 1
      ? `A task was added from the call session with ${speakerMention} on ${sessionDateTime}.`
      : `${String(taskCount)} tasks were added from the call session with ${speakerMention} on ${sessionDateTime}.`,
  ja: (sessionDateTime, speakerMention, taskCount) =>
    `${sessionDateTime} の ${speakerMention} さんとの通話セッションでタスクが${String(taskCount)}件追加されました。`,
});

export const buildTasksCreatedFromCallRootFallbackText = ({
  language,
  sessionStartedAt,
  speakerSlackUserId,
  taskCount,
  timezone,
}: {
  readonly language: Language;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly taskCount: number;
  readonly timezone: string;
}): string => {
  const sessionDateTime = formatSlackDateTime({
    isoDateTime: sessionStartedAt,
    language,
    timezone,
  });

  return getCreatedFromCallText(language)(
    sessionDateTime,
    `<@${speakerSlackUserId}>`,
    taskCount
  );
};

export const buildTasksCreatedFromCallRootBlocks = ({
  language,
  sessionStartedAt,
  speakerSlackUserId,
  taskCount,
  timezone,
}: {
  readonly language: Language;
  readonly sessionStartedAt: string;
  readonly speakerSlackUserId: string;
  readonly taskCount: number;
  readonly timezone: string;
}): readonly KnownBlock[] => {
  const text = buildTasksCreatedFromCallRootFallbackText({
    language,
    sessionStartedAt,
    speakerSlackUserId,
    taskCount,
    timezone,
  });

  return [
    {
      text: {
        text: `:memo: ${text}`,
        type: 'mrkdwn',
      },
      type: 'section',
    },
  ];
};
