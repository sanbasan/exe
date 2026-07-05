import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import { slackActionIds } from '#slack/contracts/ids';
import { formatSlackDateTime, toLocalDay } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import { slackTaskLinkUrl } from '#slack/utils/task-link';
import type { Language, WorkTask } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const DEFAULT_CHANNEL_KEY = 'exe.default';
const DEFAULT_CHANNEL_NAME = 'exe';
const WARNING_WINDOW_DAYS = 1;
const MILLISECONDS_PER_DAY = 86_400_000;

const getCompleteButtonText = dispatcher<Language, string>({
  en: 'Complete',
  ja: '完了',
});

export type TaskSectionKind = 'assigned' | 'requested';

const getSectionHeaderText = dispatcher<
  TaskSectionKind,
  (language: Language) => string
>({
  assigned: dispatcher<Language, string>({
    en: 'Assigned to you',
    ja: '担当タスク',
  }),
  requested: dispatcher<Language, string>({
    en: 'Requested by you',
    ja: '依頼したタスク',
  }),
});

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

const getChannelKey = (task: WorkTask): string =>
  task.channelId ?? DEFAULT_CHANNEL_KEY;

const getChannelName = ({
  channelKey,
  channelNames,
}: {
  readonly channelKey: string;
  readonly channelNames: ReadonlyMap<string, string>;
}): string => {
  if (channelKey === DEFAULT_CHANNEL_KEY) {
    return DEFAULT_CHANNEL_NAME;
  }

  return channelNames.get(channelKey) ?? channelKey;
};

const groupTasksByChannel = (
  tasks: readonly WorkTask[]
): readonly {
  readonly channelKey: string;
  readonly tasks: readonly WorkTask[];
}[] =>
  Object.entries(Object.groupBy(tasks, getChannelKey)).map(
    ([channelKey, channelTasks]) => ({
      channelKey,
      tasks: channelTasks ?? [],
    })
  );

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

const buildChannelBlocks = ({
  appUrl,
  channelKey,
  channelNames,
  language,
  now,
  slackDomain,
  tasks,
  timezone,
}: {
  readonly appUrl: string;
  readonly channelKey: string;
  readonly channelNames: ReadonlyMap<string, string>;
  readonly language: Language;
  readonly now: string;
  readonly slackDomain: string;
  readonly tasks: readonly WorkTask[];
  readonly timezone: string;
}): readonly KnownBlock[] => [
  {
    text: {
      text: `#${getChannelName({ channelKey, channelNames })}`,
      type: 'plain_text',
    },
    type: 'header',
  },
  ...tasks.flatMap((task) => [
    { type: 'divider' as const },
    buildTaskRow({ appUrl, language, now, slackDomain, task, timezone }),
  ]),
];

export const buildTaskSection = ({
  appUrl,
  channelNames,
  language,
  now,
  sectionKind,
  slackDomain,
  tasks,
  timezone,
}: {
  readonly appUrl: string;
  readonly channelNames: ReadonlyMap<string, string>;
  readonly language: Language;
  readonly now: string;
  readonly sectionKind: TaskSectionKind;
  readonly slackDomain: string;
  readonly tasks: readonly WorkTask[];
  readonly timezone: string;
}): readonly KnownBlock[] => {
  const taskGroups = groupTasksByChannel(tasks);
  const channelBlocks = taskGroups.flatMap((taskGroup) =>
    buildChannelBlocks({
      appUrl,
      channelKey: taskGroup.channelKey,
      channelNames,
      language,
      now,
      slackDomain,
      tasks: taskGroup.tasks,
      timezone,
    })
  );

  return [
    {
      text: {
        emoji: true,
        text: getSectionHeaderText(sectionKind)(language),
        type: 'plain_text',
      },
      type: 'header',
    },
    ...channelBlocks,
    homeSectionSpacerBlock(),
  ];
};
