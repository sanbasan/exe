/* eslint-disable max-lines -- App Home channel renderer keeps the Slack block layout in display order. */
import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import {
  getChannelBlocksHeading,
  getChannelReviewStatusHeading,
  getTaskSectionHeading,
} from '#slack/app-home/copy';
import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import { formatSlackDateTime, toLocalDay } from '#slack/utils/date-time';
import { slackMessageUrl } from '#slack/utils/slack-link';
import { slackTaskLinkUrl } from '#slack/utils/task-link';
import {
  isActiveChannelBlock,
  type Channel,
  type ChannelBlock,
  type ChannelReviewState,
  type Language,
  type WorkTask,
} from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const WARNING_WINDOW_DAYS = 1;
const MILLISECONDS_PER_DAY = 86_400_000;

const getCompleteButtonText = (language: Language): string =>
  language === 'ja' ? '完了' : 'Complete';

const normalizeSlackMrkdwn = (text: string): string =>
  text.replaceAll(/\*\*([^*\n]+)\*\*/gu, '*$1*');

const removeBlankLines = (text: string): string =>
  text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n');

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
  readonly blockId?: string;
  readonly text: string;
}): KnownBlock => ({
  ...(blockId === undefined ? {} : { block_id: blockId }),
  text: {
    text,
    type: 'mrkdwn',
  },
  type: 'section',
});

const contextBlock = ({
  blockId,
  text,
}: {
  readonly blockId?: string;
  readonly text: string;
}): KnownBlock => ({
  ...(blockId === undefined ? {} : { block_id: blockId }),
  elements: [
    {
      text: normalizeSlackMrkdwn(text),
      type: 'mrkdwn',
    },
  ],
  type: 'context',
});

const dividerBlock = (): KnownBlock => ({ type: 'divider' });

const channelBlockId = ({
  channel,
  suffix,
}: {
  readonly channel: Channel;
  readonly suffix: string;
}): string => `${slackBlockIds.channel}.${channel.channelId}.${suffix}`;

const formatChannelHeading = (channel: Channel): string => `#${channel.name}`;

const toTaskUrl = ({
  appUrl,
  taskId,
}: {
  readonly appUrl: string;
  readonly taskId: string;
}): string => {
  const baseUrl = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;

  return new URL(`tasks/${taskId}`, baseUrl).toString();
};

const toTaskLinkUrl = ({
  appUrl,
  slackDomain,
  task,
}: {
  readonly appUrl: string;
  readonly slackDomain: string;
  readonly task: WorkTask;
}): string => {
  const slackUrl = slackTaskLinkUrl({ slackDomain, task });

  return slackUrl ?? toTaskUrl({ appUrl, taskId: task.id });
};

const shouldWarnDueSoon = ({
  dueAt,
  now,
  timezone,
}: {
  readonly dueAt: string;
  readonly now: string;
  readonly timezone: string;
}): boolean => {
  const dueDate = new Date(dueAt);

  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const today = toLocalDay({ isoDateTime: now, timezone });
  const warningStart = toLocalDay({
    isoDateTime: new Date(
      dueDate.getTime() - WARNING_WINDOW_DAYS * MILLISECONDS_PER_DAY
    ).toISOString(),
    timezone,
  });

  return today !== null && warningStart !== null && today >= warningStart;
};

const formatDueAt = ({
  language,
  task,
  timezone,
}: {
  readonly language: Language;
  readonly task: WorkTask;
  readonly timezone: string;
}): string =>
  task.dueAt === undefined
    ? ''
    : `  ${formatSlackDateTime({
        isoDateTime: task.dueAt,
        language,
        timezone,
      })}`;

const getWarningEmoji = ({
  now,
  task,
  timezone,
}: {
  readonly now: string;
  readonly task: WorkTask;
  readonly timezone: string;
}): string => {
  if (task.dueAt === undefined) {
    return '';
  }

  return shouldWarnDueSoon({ dueAt: task.dueAt, now, timezone })
    ? ':warning: '
    : '';
};

const formatTaskTitleLink = ({
  title,
  url,
}: {
  readonly title: string;
  readonly url: string;
}): string => `<${url}|*${title}*>`;

const buildTaskRow = ({
  appUrl,
  language,
  now,
  slackDomain,
  task,
  timezone,
}: {
  readonly appUrl: string;
  readonly language: Language;
  readonly now: string;
  readonly slackDomain: string;
  readonly task: WorkTask;
  readonly timezone: string;
}): KnownBlock => ({
  accessory: {
    action_id: slackActionIds.completeTask,
    style: 'primary',
    text: {
      text: getCompleteButtonText(language),
      type: 'plain_text',
    },
    type: 'button',
    value: task.id,
  },
  text: {
    text: `${getWarningEmoji({ now, task, timezone })}${formatTaskTitleLink({
      title: task.title,
      url: toTaskLinkUrl({
        appUrl,
        slackDomain,
        task,
      }),
    })}${formatDueAt({ language, task, timezone })}`,
    type: 'mrkdwn',
  },
  type: 'section',
});

const buildLatestInfoBlocks = ({
  channel,
}: {
  readonly channel: Channel;
}): readonly KnownBlock[] => {
  if (channel.latestInfo === undefined) {
    return [];
  }

  return [
    contextBlock({
      blockId: channelBlockId({ channel, suffix: 'latest_info' }),
      text: channel.latestInfo,
    }),
  ];
};

const formatBlockTitleText = ({
  block,
  slackDomain,
}: {
  readonly block: ChannelBlock;
  readonly slackDomain: string;
}): string => {
  if (block.messageTs === undefined) {
    return `*${block.title}*`;
  }

  const url = slackMessageUrl({
    channelId: block.channelId,
    messageTs: block.messageTs,
    slackDomain,
    ...(block.threadTs === undefined ? {} : { threadTs: block.threadTs }),
  });

  return `<${url}|*${block.title}*>`;
};

// Title and description share one section: an accessory button forces the
// section to the button's height, so a separate context block below would sit
// after a visible gap.
const buildBlockItem = ({
  block,
  channel,
  language,
  slackDomain,
}: {
  readonly block: ChannelBlock;
  readonly channel: Channel;
  readonly language: Language;
  readonly slackDomain: string;
}): readonly KnownBlock[] => [
  dividerBlock(),
  {
    accessory: {
      action_id: slackActionIds.resolveChannelBlock,
      style: 'primary',
      text: {
        text: getCompleteButtonText(language),
        type: 'plain_text',
      },
      type: 'button',
      value: block.id,
    },
    block_id: channelBlockId({ channel, suffix: `block.${block.id}` }),
    text: {
      text: `${formatBlockTitleText({ block, slackDomain })}\n${normalizeSlackMrkdwn(block.description)}`,
      type: 'mrkdwn',
    },
    type: 'section',
  },
];

const buildBlockBlocks = ({
  blocks,
  channel,
  language,
  slackDomain,
}: {
  readonly blocks: readonly ChannelBlock[];
  readonly channel: Channel;
  readonly language: Language;
  readonly slackDomain: string;
}): readonly KnownBlock[] => {
  if (blocks.length === 0) {
    return [];
  }

  return [
    sectionBlock({
      blockId: channelBlockId({ channel, suffix: 'blocks' }),
      text: `*${getChannelBlocksHeading(language)}*`,
    }),
    ...blocks.flatMap((block) =>
      buildBlockItem({ block, channel, language, slackDomain })
    ),
  ];
};

const formatReviewStateText = ({
  language,
  state,
  timezone,
}: {
  readonly language: Language;
  readonly state: ChannelReviewState;
  readonly timezone: string;
}): string => {
  const statusText = state.statusText ?? state.lastSelfReport ?? '';
  const reportTimestamp =
    state.statusUpdatedAt ?? state.lastCheckedAt ?? state.updatedAt;
  const reportDateTime = formatSlackDateTime({
    isoDateTime: reportTimestamp,
    language,
    timezone,
  });

  return `*<@${state.slackUserId}>*  ${reportDateTime}\n${removeBlankLines(statusText)}`;
};

const buildReviewStateBlocks = ({
  channel,
  language,
  reviewStates,
  timezone,
}: {
  readonly channel: Channel;
  readonly language: Language;
  readonly reviewStates: readonly ChannelReviewState[];
  readonly timezone: string;
}): readonly KnownBlock[] => {
  const channelReviewStates = reviewStates
    .filter((state) => state.channelId === channel.channelId)
    .filter(
      (state) =>
        state.statusText !== undefined || state.lastSelfReport !== undefined
    )
    .toSorted((left, right) =>
      (right.statusUpdatedAt ?? right.updatedAt).localeCompare(
        left.statusUpdatedAt ?? left.updatedAt
      )
    );

  if (channelReviewStates.length === 0) {
    return [];
  }

  return [
    sectionBlock({
      blockId: channelBlockId({ channel, suffix: 'review_states' }),
      text: `*${getChannelReviewStatusHeading(language)}*`,
    }),
    ...channelReviewStates.flatMap((state) => [
      dividerBlock(),
      contextBlock({
        blockId: channelBlockId({
          channel,
          suffix: `review_state.${state.slackUserId}`,
        }),
        text: formatReviewStateText({ language, state, timezone }),
      }),
    ]),
  ];
};

const buildTaskItem = ({
  appUrl,
  language,
  now,
  slackDomain,
  task,
  timezone,
}: {
  readonly appUrl: string;
  readonly language: Language;
  readonly now: string;
  readonly slackDomain: string;
  readonly task: WorkTask;
  readonly timezone: string;
}): readonly KnownBlock[] => [
  dividerBlock(),
  buildTaskRow({ appUrl, language, now, slackDomain, task, timezone }),
];

const buildTaskBlocks = ({
  appUrl,
  channel,
  language,
  now,
  sectionKind,
  slackDomain,
  tasks,
  timezone,
}: {
  readonly appUrl: string;
  readonly channel: Channel;
  readonly language: Language;
  readonly now: string;
  readonly sectionKind: 'assigned' | 'requested';
  readonly slackDomain: string;
  readonly tasks: readonly WorkTask[];
  readonly timezone: string;
}): readonly KnownBlock[] => {
  if (tasks.length === 0) {
    return [];
  }

  return [
    sectionBlock({
      blockId: channelBlockId({ channel, suffix: `${sectionKind}_tasks` }),
      text: `*${getTaskSectionHeading(sectionKind)(language)}*`,
    }),
    ...tasks.flatMap((task) =>
      buildTaskItem({ appUrl, language, now, slackDomain, task, timezone })
    ),
  ];
};

const getChannelTasks = ({
  channel,
  tasks,
}: {
  readonly channel: Channel;
  readonly tasks: readonly WorkTask[];
}): readonly WorkTask[] =>
  tasks.filter((task) => task.channelId === channel.channelId);

const getChannelBlocks = ({
  blocks,
  channel,
}: {
  readonly blocks: readonly ChannelBlock[];
  readonly channel: Channel;
}): readonly ChannelBlock[] =>
  blocks
    .filter(isActiveChannelBlock)
    .filter((block) => block.channelId === channel.channelId)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));

const buildSingleChannelSection = ({
  appUrl,
  blocks,
  channel,
  language,
  now,
  requestedWorkTasks,
  reviewStates,
  slackDomain,
  timezone,
  workTasks,
}: {
  readonly appUrl: string;
  readonly blocks: readonly ChannelBlock[];
  readonly channel: Channel;
  readonly language: Language;
  readonly now: string;
  readonly requestedWorkTasks: readonly WorkTask[];
  readonly reviewStates: readonly ChannelReviewState[];
  readonly slackDomain: string;
  readonly timezone: string;
  readonly workTasks: readonly WorkTask[];
}): readonly KnownBlock[] => {
  const contentBlocks = [
    ...buildLatestInfoBlocks({ channel }),
    ...buildReviewStateBlocks({
      channel,
      language,
      reviewStates,
      timezone,
    }),
    ...buildBlockBlocks({
      blocks: getChannelBlocks({ blocks, channel }),
      channel,
      language,
      slackDomain,
    }),
    ...buildTaskBlocks({
      appUrl,
      channel,
      language,
      now,
      sectionKind: 'assigned',
      slackDomain,
      tasks: getChannelTasks({ channel, tasks: workTasks }),
      timezone,
    }),
    ...buildTaskBlocks({
      appUrl,
      channel,
      language,
      now,
      sectionKind: 'requested',
      slackDomain,
      tasks: getChannelTasks({ channel, tasks: requestedWorkTasks }),
      timezone,
    }),
  ];

  return contentBlocks.length === 0
    ? []
    : [headerBlock(formatChannelHeading(channel)), ...contentBlocks];
};

export const buildHomeChannelSection = ({
  appUrl,
  blocks,
  channels,
  language,
  now,
  requestedWorkTasks,
  reviewStates,
  slackDomain,
  timezone,
  workTasks,
}: {
  readonly appUrl: string;
  readonly blocks: readonly ChannelBlock[];
  readonly channels: readonly Channel[];
  readonly language: Language;
  readonly now: string;
  readonly requestedWorkTasks: readonly WorkTask[];
  readonly reviewStates: readonly ChannelReviewState[];
  readonly slackDomain: string;
  readonly timezone: string;
  readonly workTasks: readonly WorkTask[];
}): readonly KnownBlock[] => {
  if (channels.length === 0) {
    return [];
  }

  const channelSections = channels
    .map((channel) =>
      buildSingleChannelSection({
        appUrl,
        blocks,
        channel,
        language,
        now,
        requestedWorkTasks,
        reviewStates,
        slackDomain,
        timezone,
        workTasks,
      })
    )
    .filter((section) => section.length > 0);

  if (channelSections.length === 0) {
    return [];
  }

  return [
    ...channelSections.flatMap((section, index) => [
      ...(index === 0 ? [] : [homeSectionSpacerBlock()]),
      ...section,
    ]),
    homeSectionSpacerBlock(),
  ];
};
