import {
  isFollowUpTask,
  type CallSchedule,
  type CallSession,
  type Language,
  type Task,
} from '@exe/domain';
import { dispatcher, formatSlackDateTime } from '@exe/slack';

interface MessageParams {
  readonly schedule?: CallSchedule;
  readonly session?: CallSession;
  readonly summary?: string;
  readonly task?: Task;
  readonly timezone?: string;
}

const getCallTime = ({
  language,
  schedule,
  timezone,
}: {
  readonly language: Language;
  readonly schedule?: CallSchedule;
  readonly timezone?: string;
}): string => {
  if (schedule?.nextRunAt !== undefined) {
    return formatSlackDateTime({
      isoDateTime: schedule.nextRunAt,
      language,
      timezone: timezone ?? 'UTC',
    });
  }

  return schedule?.timeOfDay ?? '';
};

export const getPrenotificationMessage = dispatcher<
  Language,
  (params: MessageParams) => string
>({
  en: ({ schedule, timezone }): string =>
    `exe will call you for task review at ${getCallTime({
      language: 'en',
      ...(schedule === undefined ? {} : { schedule }),
      ...(timezone === undefined ? {} : { timezone }),
    })}.`,
  ja: ({ schedule, timezone }): string =>
    `exe から ${getCallTime({
      language: 'ja',
      ...(schedule === undefined ? {} : { schedule }),
      ...(timezone === undefined ? {} : { timezone }),
    })} にタスク確認の通話をします。`,
});

export const getScheduledCallDueMessage = dispatcher<
  Language,
  (params: MessageParams) => string
>({
  en: ({ schedule, timezone }): string =>
    `It is time for your exe task review call (${getCallTime({
      language: 'en',
      ...(schedule === undefined ? {} : { schedule }),
      ...(timezone === undefined ? {} : { timezone }),
    })}). Join now, or exe will call you in 10 minutes.`,
  ja: ({ schedule, timezone }): string =>
    `exe のタスク確認通話の時間です（${getCallTime({
      language: 'ja',
      ...(schedule === undefined ? {} : { schedule }),
      ...(timezone === undefined ? {} : { timezone }),
    })}）。今参加できます。参加がなければ 10 分後に exe から着信します。`,
});

export const getMissedCallMessage = dispatcher<
  Language,
  (params: MessageParams) => string
>({
  en: (): string =>
    'You missed an exe task review call. You can start a manual review from App Home or the iOS app.',
  ja: (): string =>
    'exe のタスク確認通話に応答がありませんでした。App Home または iOS アプリから手動タスク確認会を開始できます。',
});

export const getCallSummaryMessage = dispatcher<
  Language,
  (params: MessageParams) => string
>({
  en: ({ summary }): string => `exe call summary\n\n${summary ?? ''}`,
  ja: ({ summary }): string => `exe 通話サマリー\n\n${summary ?? ''}`,
});

export const getFollowUpAnswerMessage = dispatcher<
  Language,
  (params: MessageParams) => string
>({
  en: ({ task }): string => {
    if (task !== undefined && isFollowUpTask(task)) {
      return `Follow-up answered: ${task.title}\n\n${task.followUpAnswer ?? ''}`;
    }

    return 'A follow-up task was answered.';
  },
  ja: ({ task }): string => {
    if (task !== undefined && isFollowUpTask(task)) {
      return `確認依頼に回答がありました: ${task.title}\n\n${task.followUpAnswer ?? ''}`;
    }

    return '確認依頼に回答がありました。';
  },
});
