import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import { buildHomeChannelSection } from '#slack/app-home/channel-section';
import { getEmptyStateText, getNextCallHeading } from '#slack/app-home/copy';
import { buildSettingsSection } from '#slack/app-home/settings-section';
import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import { formatEnglishDateTime } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type {
  CallSchedule,
  Channel,
  ChannelBlock,
  ChannelReviewState,
  Language,
  WorkTask,
} from '@exe/domain';
import type { KnownBlock, View } from '@slack/types';

const headerBlock = (text: string): KnownBlock => ({
  text: {
    emoji: true,
    text,
    type: 'plain_text',
  },
  type: 'header',
});

const sectionBlock = ({
  blockId,
  text,
}: {
  readonly blockId: string;
  readonly text: string;
}): KnownBlock => ({
  block_id: blockId,
  text: {
    text,
    type: 'mrkdwn',
  },
  type: 'section',
});

const dividerBlock = (): KnownBlock => ({
  type: 'divider',
});

const getPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string => parts.find((part) => part.type === type)?.value ?? '';

const formatDate = dispatcher<Language, [date: Date, timezone: string], string>(
  {
    en: (date, timezone) => formatEnglishDateTime({ date, timezone }),
    ja: (date, timezone) => {
      const parts = new Intl.DateTimeFormat('ja-JP', {
        day: 'numeric',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: 'numeric',
        timeZone: timezone,
      }).formatToParts(date);

      return `${getPart(parts, 'month')}月${getPart(parts, 'day')}日 ${getPart(
        parts,
        'hour'
      )}:${getPart(parts, 'minute')}`;
    },
  }
);

const formatNextCallDateTime = ({
  isoDateTime,
  language,
  timezone,
}: {
  readonly isoDateTime: string;
  readonly language: Language;
  readonly timezone: string;
}): string => {
  const date = new Date(isoDateTime);

  if (Number.isNaN(date.getTime())) {
    return isoDateTime;
  }

  return formatDate(language)(date, timezone);
};

const getNextCallLineLabel = dispatcher<Language, string>({
  en: 'Next',
  ja: '次回',
});

const getNoNextCallText = dispatcher<Language, string>({
  en: 'Regular calls are off.',
  ja: '定例通話はオフです。',
});

const getAdjustCallScheduleText = dispatcher<Language, string>({
  en: 'Schedule',
  ja: '日程調整',
});

const formatNextCallLine = dispatcher<
  Language,
  [label: string, nextCallDateTime: string],
  string
>({
  en: (label, nextCallDateTime) => `${label}: ${nextCallDateTime}`,
  ja: (label, nextCallDateTime) => `${label}：${nextCallDateTime}`,
});

const buildScheduleSection = ({
  language,
  schedule,
  timezone,
}: {
  readonly language: Language;
  readonly schedule: CallSchedule | null;
  readonly timezone: string;
}): readonly KnownBlock[] => {
  if (schedule === null) {
    return [];
  }

  const scheduleText =
    schedule.nextRunAt === undefined
      ? getNoNextCallText(language)
      : formatNextCallLine(language)(
          getNextCallLineLabel(language),
          formatNextCallDateTime({
            isoDateTime: schedule.nextRunAt,
            language,
            timezone,
          })
        );

  return [
    headerBlock(getNextCallHeading(language)),
    {
      accessory: {
        action_id: slackActionIds.openCallScheduleSettings,
        text: {
          text: getAdjustCallScheduleText(language),
          type: 'plain_text',
        },
        type: 'button',
      },
      block_id: slackBlockIds.nextCall,
      text: {
        text: scheduleText,
        type: 'mrkdwn',
      },
      type: 'section',
    },
    dividerBlock(),
    homeSectionSpacerBlock(),
  ];
};

export const buildAppHomeView = ({
  appUrl,
  canEditChannelOwners,
  canManageAdmins,
  channelBlocks,
  channels,
  language,
  now,
  requestedWorkTasks,
  reviewStates,
  schedule,
  slackDomain,
  timezone,
  workTasks,
}: {
  readonly appUrl: string;
  readonly canEditChannelOwners: boolean;
  readonly canManageAdmins: boolean;
  readonly channelBlocks: readonly ChannelBlock[];
  readonly channels: readonly Channel[];
  readonly language: Language;
  readonly now: string;
  readonly requestedWorkTasks: readonly WorkTask[];
  readonly reviewStates: readonly ChannelReviewState[];
  readonly schedule: CallSchedule | null;
  readonly slackDomain: string;
  readonly timezone: string;
  readonly workTasks: readonly WorkTask[];
}): View => {
  const sections = [
    ...buildScheduleSection({ language, schedule, timezone }),
    ...buildHomeChannelSection({
      appUrl,
      blocks: channelBlocks,
      channels,
      language,
      now,
      requestedWorkTasks,
      reviewStates,
      slackDomain,
      timezone,
      workTasks,
    }),
    ...buildSettingsSection({
      canEditChannelOwners,
      canManageWorkspaceSettings: canManageAdmins,
      language,
    }),
  ];
  const emptySection: readonly KnownBlock[] =
    sections.length === 0
      ? [
          sectionBlock({
            blockId: `${slackBlockIds.workTasks}.empty`,
            text: getEmptyStateText(language),
          }),
        ]
      : [];

  return {
    blocks: [...sections, ...emptySection],
    type: 'home',
  };
};
