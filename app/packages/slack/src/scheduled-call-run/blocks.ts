import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import { buildScheduledCallRunActionsBlockId } from '#slack/scheduled-call-run/reference';
import {
  getScheduledCallRunReschedulePresetLabel,
  listScheduledCallRunReschedulePresets,
} from '#slack/scheduled-call-run/reschedule-presets';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const getJoinButtonText = dispatcher<Language, string>({
  en: 'Join :telephone_receiver:',
  ja: '参加する :telephone_receiver:',
});

const getReviewCallHeading = dispatcher<Language, string>({
  en: 'Task review call',
  ja: 'タスク確認通話',
});

const getReschedulePlaceholder = dispatcher<Language, string>({
  en: 'Reschedule',
  ja: '時間をずらす',
});

const getReschedulePickTimeText = dispatcher<Language, string>({
  en: 'Pick a time…',
  ja: '時間を指定…',
});

const getSkipButtonText = dispatcher<Language, string>({
  en: 'Skip this run',
  ja: 'この回をスキップ',
});

const getRescheduleHint = dispatcher<Language, string>({
  en: 'Need more time? Push this call back or pick a custom time.',
  ja: 'まだ時間が必要ですか？ 後ろにずらすか、時間を指定できます。',
});

/**
 * Builds the scheduled-call DM, modeled after the topaz overdue-notification UI:
 * a primary action, a reschedule `static_select` with quick presets, a button to
 * open a custom-time modal, and the skip button.
 */
export const buildScheduledCallRunBlocks = ({
  joinUrl,
  language,
  message,
  reference,
}: {
  readonly joinUrl: string;
  readonly language: Language;
  readonly message: string;
  readonly reference: string;
}): readonly KnownBlock[] => [
  {
    block_id: `${slackBlockIds.scheduledCallRun}.message`,
    text: {
      text: `*${getReviewCallHeading(language)}*\n${message}`,
      type: 'mrkdwn',
    },
    type: 'section',
  },
  {
    elements: [
      {
        text: getRescheduleHint(language),
        type: 'mrkdwn',
      },
    ],
    type: 'context',
  },
  {
    block_id: buildScheduledCallRunActionsBlockId(reference),
    elements: [
      {
        action_id: slackActionIds.openExeApp,
        style: 'primary',
        text: {
          text: getJoinButtonText(language),
          type: 'plain_text',
        },
        type: 'button',
        url: joinUrl,
      },
      {
        action_id: slackActionIds.rescheduleScheduledCallRun,
        options: listScheduledCallRunReschedulePresets().map((preset) => ({
          text: {
            text: getScheduledCallRunReschedulePresetLabel({
              language,
              preset,
            }),
            type: 'plain_text',
          },
          value: preset,
        })),
        placeholder: {
          text: getReschedulePlaceholder(language),
          type: 'plain_text',
        },
        type: 'static_select',
      },
      {
        action_id: slackActionIds.openScheduledCallRunReschedule,
        text: {
          text: getReschedulePickTimeText(language),
          type: 'plain_text',
        },
        type: 'button',
        value: reference,
      },
      {
        action_id: slackActionIds.skipScheduledCallRun,
        style: 'danger',
        text: {
          text: getSkipButtonText(language),
          type: 'plain_text',
        },
        type: 'button',
        value: reference,
      },
    ],
    type: 'actions',
  },
];

const getStatusText = dispatcher<
  Language,
  [kind: ScheduledCallRunStatusKind, time: string],
  string
>({
  en: (kind, time) => {
    switch (kind) {
      case 'rescheduled':
        return `:calendar: Rescheduled to ${time}.`;
      case 'skipped':
        return ':double_vertical_bar: This run was skipped.';
      case 'already_started':
        return ':telephone_receiver: This call has already started.';
      case 'already_closed':
        return ':white_check_mark: This run is already closed.';
      case 'invalid':
        return ':warning: This action is no longer valid.';
    }
  },
  ja: (kind, time) => {
    switch (kind) {
      case 'rescheduled':
        return `:calendar: ${time} に再調整しました。`;
      case 'skipped':
        return ':double_vertical_bar: この回はスキップしました。';
      case 'already_started':
        return ':telephone_receiver: この回はすでに開始済みです。';
      case 'already_closed':
        return ':white_check_mark: この回はすでに終了しています。';
      case 'invalid':
        return ':warning: この操作は有効期限切れです。';
    }
  },
});

export type ScheduledCallRunStatusKind =
  | 'already_closed'
  | 'already_started'
  | 'invalid'
  | 'rescheduled'
  | 'skipped';

export const buildScheduledCallRunStatusText = ({
  kind,
  language,
  time,
}: {
  readonly kind: ScheduledCallRunStatusKind;
  readonly language: Language;
  readonly time?: string;
}): string => getStatusText(language)(kind, time ?? '');

export const buildScheduledCallRunStatusBlocks = ({
  kind,
  language,
  time,
}: {
  readonly kind: ScheduledCallRunStatusKind;
  readonly language: Language;
  readonly time?: string;
}): readonly KnownBlock[] => [
  {
    block_id: `${slackBlockIds.scheduledCallRun}.status`,
    text: {
      text: `*${getReviewCallHeading(
        language
      )}*\n${buildScheduledCallRunStatusText({
        kind,
        language,
        ...(time === undefined ? {} : { time }),
      })}`,
      type: 'mrkdwn',
    },
    type: 'section',
  },
];
