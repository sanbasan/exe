import {
  buildTaskOverflowActionValue,
  slackActionIds,
  taskOverflowActions,
} from '#slack/contracts';
import { getUserText, type TaskMessageUser } from '#slack/message/user';
import { formatSlackDateTime } from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import {
  isWorkTask,
  type Language,
  type Task,
  type TaskStatus,
  type WorkTask,
} from '@exe/domain';
import type { ActionsBlockElement, KnownBlock, Overflow } from '@slack/types';

const getReopenText = dispatcher<Language, string>({
  en: 'Reopen',
  ja: '再開',
});

const getEditText = dispatcher<Language, string>({
  en: 'Edit :pencil:',
  ja: '編集 :pencil:',
});

const getCompleteText = dispatcher<Language, string>({
  en: 'Complete :sparkles:',
  ja: '完了 :sparkles:',
});

const getEditTaskOptionText = dispatcher<Language, string>({
  en: 'Edit task',
  ja: 'タスクを編集',
});

const getCancelTaskOptionText = dispatcher<Language, string>({
  en: 'Cancel task',
  ja: 'タスクをキャンセル',
});

const getChannelSettingsText = dispatcher<Language, string>({
  en: 'Channel settings',
  ja: 'チャンネル設定',
});

const getDueAtLabel = dispatcher<Language, string>({
  en: '*Due at:*',
  ja: '*期限:*',
});

const getRequestedByLabel = dispatcher<Language, string>({
  en: '*Requested by:*',
  ja: '*依頼者:*',
});

const getAssigneesLabel = dispatcher<Language, string>({
  en: '*Assignees:*',
  ja: '*担当者:*',
});

const getNoDueDateText = dispatcher<Language, string>({
  en: 'No due date',
  ja: '期限なし',
});

const formatDueAtText = ({
  dueAt,
  language,
  timezone,
}: {
  readonly dueAt?: string;
  readonly language: Language;
  readonly timezone: string;
}): string =>
  dueAt === undefined
    ? getNoDueDateText(language)
    : formatSlackDateTime({ isoDateTime: dueAt, language, timezone });

const getStatusEmoji = (status: TaskStatus): string => {
  switch (status) {
    case 'active':
      return ':memo:';
    case 'blocked':
      return ':warning:';
    case 'cancelled':
      return ':no_entry_sign:';
    case 'completed':
      return ':white_check_mark:';
  }
};

const buildTaskOverflow = ({
  language,
  task,
}: {
  readonly language: Language;
  readonly task: WorkTask;
}): Overflow => {
  const channelSettingsOption =
    task.channelId === undefined
      ? []
      : [
          {
            text: {
              text: getChannelSettingsText(language),
              type: 'plain_text' as const,
            },
            value: buildTaskOverflowActionValue({
              action: taskOverflowActions.channelSettings,
              taskId: task.id,
            }),
          },
        ];

  return {
    action_id: slackActionIds.taskOverflow,
    options: [
      {
        text: {
          text: getEditTaskOptionText(language),
          type: 'plain_text',
        },
        value: buildTaskOverflowActionValue({
          action: taskOverflowActions.edit,
          taskId: task.id,
        }),
      },
      {
        text: {
          text: getCancelTaskOptionText(language),
          type: 'plain_text',
        },
        value: buildTaskOverflowActionValue({
          action: taskOverflowActions.cancel,
          taskId: task.id,
        }),
      },
      ...channelSettingsOption,
    ],
    type: 'overflow',
  };
};

const buildActionButtons = ({
  language,
  task,
}: {
  readonly language: Language;
  readonly task: Task;
}): ActionsBlockElement[] => {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return [
      {
        action_id: slackActionIds.reopenTask,
        text: {
          text: getReopenText(language),
          type: 'plain_text',
        },
        type: 'button',
        value: task.id,
      },
    ];
  }

  if (!isWorkTask(task)) {
    return [];
  }

  return [
    {
      action_id: slackActionIds.editTask,
      text: {
        text: getEditText(language),
        type: 'plain_text',
      },
      type: 'button',
      value: task.id,
    },
    {
      action_id: slackActionIds.completeTask,
      style: 'primary',
      text: {
        text: getCompleteText(language),
        type: 'plain_text',
      },
      type: 'button',
      value: task.id,
    },
  ];
};

const buildDueAtChangedBlock = ({
  language,
  previousDueAt,
  task,
  timezone,
}: {
  readonly language: Language;
  readonly previousDueAt?: string;
  readonly task: WorkTask;
  readonly timezone: string;
}): readonly KnownBlock[] => {
  if (previousDueAt === undefined || previousDueAt === task.dueAt) {
    return [];
  }

  return [
    {
      elements: [
        {
          text: `${getDueAtLabel(language)} ${formatDueAtText({
            dueAt: previousDueAt,
            language,
            timezone,
          })} → ${formatDueAtText({
            ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
            language,
            timezone,
          })}`,
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
  ];
};

export const buildTaskMessageBlocks = ({
  assignees,
  language,
  previousDueAt,
  requesters,
  task,
  timezone,
}: {
  readonly assignees: readonly TaskMessageUser[];
  readonly language: Language;
  readonly previousDueAt?: string;
  readonly requesters: readonly TaskMessageUser[];
  readonly task: Task;
  readonly timezone: string;
}): readonly KnownBlock[] => {
  const actions = buildActionButtons({ language, task });
  const accessory =
    isWorkTask(task) &&
    task.status !== 'completed' &&
    task.status !== 'cancelled'
      ? buildTaskOverflow({ language, task })
      : undefined;
  const dueAtText = isWorkTask(task)
    ? formatDueAtText({
        ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
        language,
        timezone,
      })
    : getNoDueDateText(language);
  const requesterText = requesters.map(getUserText).join(', ');
  const assigneeText = assignees.map(getUserText).join(', ');

  return [
    {
      ...(accessory === undefined ? {} : { accessory }),
      text: {
        text: `${getStatusEmoji(task.status)} *${task.title}*`,
        type: 'mrkdwn',
      },
      type: 'section',
    },
    {
      elements: [
        {
          text: `${getDueAtLabel(language)} ${dueAtText}\n${getRequestedByLabel(
            language
          )} ${requesterText}\n${getAssigneesLabel(language)} ${assigneeText}`,
          type: 'mrkdwn',
        },
      ],
      type: 'context',
    },
    ...(actions.length === 0
      ? []
      : [
          {
            elements: actions,
            type: 'actions' as const,
          },
        ]),
    ...(isWorkTask(task)
      ? buildDueAtChangedBlock({
          language,
          ...(previousDueAt === undefined ? {} : { previousDueAt }),
          task,
          timezone,
        })
      : []),
  ];
};
