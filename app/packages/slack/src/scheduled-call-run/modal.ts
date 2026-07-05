import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { View } from '@slack/types';

const getModalTitle = dispatcher<Language, string>({
  en: 'Reschedule call',
  ja: '通話の再調整',
});

const getSubmitText = dispatcher<Language, string>({
  en: 'Reschedule',
  ja: '再調整',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Cancel',
  ja: 'キャンセル',
});

const getIntroText = dispatcher<Language, string>({
  en: 'Pick a new time for today’s call. Choosing a time in the past skips this run.',
  ja: '今日の通話の新しい時刻を選んでください。過去の時刻を選ぶと、この回はスキップ扱いになります。',
});

const getDateLabel = dispatcher<Language, string>({
  en: 'Date',
  ja: '日付',
});

const getDatePlaceholder = dispatcher<Language, string>({
  en: 'Select date',
  ja: '日付を選択',
});

const getTimeLabel = dispatcher<Language, string>({
  en: 'Time',
  ja: '時刻',
});

const getTimePlaceholder = dispatcher<Language, string>({
  en: 'Select time',
  ja: '時刻を選択',
});

const getTimezoneHint = dispatcher<Language, [timezone: string], string>({
  en: (timezone) => `Time zone: ${timezone}`,
  ja: (timezone) => `タイムゾーン: ${timezone}`,
});

interface ScheduledCallRunRescheduleModalMetadata {
  readonly channelId?: string;
  readonly messageTs?: string;
  readonly reference: string;
}

const PRIVATE_METADATA_PREFIX = 'v1|';
const PRIVATE_METADATA_SEPARATOR = '|';

export const buildScheduledCallRunRescheduleModalPrivateMetadata = ({
  channelId,
  messageTs,
  reference,
}: ScheduledCallRunRescheduleModalMetadata): string =>
  channelId === undefined || messageTs === undefined
    ? reference
    : [
        PRIVATE_METADATA_PREFIX.slice(0, -1),
        channelId,
        messageTs,
        reference,
      ].join(PRIVATE_METADATA_SEPARATOR);

export const parseScheduledCallRunRescheduleModalPrivateMetadata = (
  value: string
): ScheduledCallRunRescheduleModalMetadata => {
  if (!value.startsWith(PRIVATE_METADATA_PREFIX)) {
    return { reference: value };
  }

  const [, channelId, messageTs, reference, extra] = value.split(
    PRIVATE_METADATA_SEPARATOR
  );

  if (
    channelId === undefined ||
    channelId.length === 0 ||
    messageTs === undefined ||
    messageTs.length === 0 ||
    reference === undefined ||
    reference.length === 0 ||
    extra !== undefined
  ) {
    return { reference: value };
  }

  return { channelId, messageTs, reference };
};

/**
 * The modal carries the signed call-run reference in its private metadata so
 * the submission handler can resolve the targeted run.
 */
export const buildScheduledCallRunRescheduleModal = ({
  channelId,
  initialDate,
  initialTime,
  language,
  messageTs,
  reference,
  timezone,
}: {
  readonly channelId?: string;
  readonly initialDate: string;
  readonly initialTime: string;
  readonly language: Language;
  readonly messageTs?: string;
  readonly reference: string;
  readonly timezone: string;
}): View => ({
  blocks: [
    {
      text: {
        text: getIntroText(language),
        type: 'mrkdwn',
      },
      type: 'section',
    },
    {
      block_id: slackBlockIds.scheduledCallRunRescheduleDate,
      element: {
        action_id: slackActionIds.scheduledCallRunRescheduleDate,
        initial_date: initialDate,
        placeholder: {
          text: getDatePlaceholder(language),
          type: 'plain_text',
        },
        type: 'datepicker',
      },
      label: {
        text: getDateLabel(language),
        type: 'plain_text',
      },
      type: 'input',
    },
    {
      block_id: slackBlockIds.scheduledCallRunRescheduleTime,
      element: {
        action_id: slackActionIds.scheduledCallRunRescheduleTime,
        initial_time: initialTime,
        placeholder: {
          text: getTimePlaceholder(language),
          type: 'plain_text',
        },
        type: 'timepicker',
      },
      label: {
        text: getTimeLabel(language),
        type: 'plain_text',
      },
      type: 'input',
    },
    {
      elements: [
        {
          text: getTimezoneHint(language)(timezone),
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
  ],
  callback_id: slackViewIds.scheduledCallRunReschedule,
  close: {
    text: getCloseText(language),
    type: 'plain_text',
  },
  private_metadata: buildScheduledCallRunRescheduleModalPrivateMetadata({
    ...(channelId === undefined ? {} : { channelId }),
    ...(messageTs === undefined ? {} : { messageTs }),
    reference,
  }),
  submit: {
    text: getSubmitText(language),
    type: 'plain_text',
  },
  title: {
    text: getModalTitle(language),
    type: 'plain_text',
  },
  type: 'modal',
});

const getRecordValue = ({
  key,
  value,
}: {
  readonly key: string;
  readonly value: unknown;
}): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

const getRescheduleDateTimeFromState = ({
  actionId,
  blockId,
  key,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly key: string;
  readonly stateValues: unknown;
}): string | null => {
  const action = getRecordValue({
    key: actionId,
    value: getRecordValue({ key: blockId, value: stateValues }),
  });
  const value = getRecordValue({ key, value: action });

  return typeof value === 'string' && value.length > 0 ? value : null;
};

export const parseScheduledCallRunRescheduleSubmission = (
  stateValues: unknown
): { readonly date: string; readonly time: string } | null => {
  const date = getRescheduleDateTimeFromState({
    actionId: slackActionIds.scheduledCallRunRescheduleDate,
    blockId: slackBlockIds.scheduledCallRunRescheduleDate,
    key: 'selected_date',
    stateValues,
  });
  const time = getRescheduleDateTimeFromState({
    actionId: slackActionIds.scheduledCallRunRescheduleTime,
    blockId: slackBlockIds.scheduledCallRunRescheduleTime,
    key: 'selected_time',
    stateValues,
  });

  if (date === null || time === null) {
    return null;
  }

  return { date, time };
};
