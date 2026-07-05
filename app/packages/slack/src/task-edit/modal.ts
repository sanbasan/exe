import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import {
  formatSlackDateInput,
  formatSlackTimeInput,
} from '#slack/utils/date-time';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language, WorkTask } from '@exe/domain';
import type { View } from '@slack/types';

const getModalTitle = dispatcher<Language, string>({
  en: 'Edit Task',
  ja: 'タスクを編集',
});

const getSubmitText = dispatcher<Language, string>({
  en: 'Submit',
  ja: '送信',
});

const getContentLabel = dispatcher<Language, string>({
  en: 'Content',
  ja: '内容',
});

const getRequestersLabel = dispatcher<Language, string>({
  en: 'Requesters',
  ja: '依頼者',
});

const getRequestersPlaceholder = dispatcher<Language, string>({
  en: 'Select requesters',
  ja: '依頼者を選択',
});

const getAssigneesLabel = dispatcher<Language, string>({
  en: 'Assignees',
  ja: '担当者',
});

const getAssigneesPlaceholder = dispatcher<Language, string>({
  en: 'Select assignees',
  ja: '担当者を選択',
});

const getDueDateLabel = dispatcher<Language, string>({
  en: 'Due Date',
  ja: '期限日',
});

const getDueDatePlaceholder = dispatcher<Language, string>({
  en: 'Select date',
  ja: '日付を選択',
});

const getDueTimeLabel = dispatcher<Language, string>({
  en: 'Due Time',
  ja: '期限時刻',
});

const getDueTimePlaceholder = dispatcher<Language, string>({
  en: 'Select time',
  ja: '時刻を選択',
});

const getTimezoneHint = dispatcher<Language, [timezone: string], string>({
  en: (timezone) => `Time zone: ${timezone}`,
  ja: (timezone) => `タイムゾーン: ${timezone}`,
});

export const buildEditTaskModalPrivateMetadata = ({
  taskId,
}: {
  readonly taskId: string;
}): string => taskId;

const getInitialDate = ({
  task,
  timezone,
}: {
  readonly task: WorkTask;
  readonly timezone: string;
}): string | null =>
  task.dueAt === undefined
    ? null
    : formatSlackDateInput({ isoDateTime: task.dueAt, timezone });

const getInitialTime = ({
  task,
  timezone,
}: {
  readonly task: WorkTask;
  readonly timezone: string;
}): string | null =>
  task.dueAt === undefined
    ? null
    : formatSlackTimeInput({ isoDateTime: task.dueAt, timezone });

export const buildEditTaskModal = ({
  language,
  task,
  timezone,
}: {
  readonly language: Language;
  readonly task: WorkTask;
  readonly timezone: string;
}): View => {
  const initialDate = getInitialDate({ task, timezone });
  const initialTime = getInitialTime({ task, timezone });

  return {
    blocks: [
      {
        block_id: slackBlockIds.taskEditTitle,
        element: {
          action_id: slackActionIds.taskEditTitle,
          initial_value: task.title,
          type: 'plain_text_input',
        },
        label: {
          text: getContentLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
      {
        block_id: slackBlockIds.taskEditRequesters,
        element: {
          action_id: slackActionIds.taskEditRequesters,
          initial_users: task.requesterSlackUserIds,
          placeholder: {
            text: getRequestersPlaceholder(language),
            type: 'plain_text',
          },
          type: 'multi_users_select',
        },
        label: {
          text: getRequestersLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
      {
        block_id: slackBlockIds.taskEditAssignees,
        element: {
          action_id: slackActionIds.taskEditAssignees,
          initial_users: task.assigneeSlackUserIds,
          placeholder: {
            text: getAssigneesPlaceholder(language),
            type: 'plain_text',
          },
          type: 'multi_users_select',
        },
        label: {
          text: getAssigneesLabel(language),
          type: 'plain_text',
        },
        type: 'input',
      },
      {
        block_id: slackBlockIds.taskEditDueDate,
        element: {
          action_id: slackActionIds.taskEditDueDate,
          ...(initialDate === null ? {} : { initial_date: initialDate }),
          placeholder: {
            text: getDueDatePlaceholder(language),
            type: 'plain_text',
          },
          type: 'datepicker',
        },
        label: {
          text: getDueDateLabel(language),
          type: 'plain_text',
        },
        optional: true,
        type: 'input',
      },
      {
        block_id: slackBlockIds.taskEditDueTime,
        element: {
          action_id: slackActionIds.taskEditDueTime,
          ...(initialTime === null ? {} : { initial_time: initialTime }),
          placeholder: {
            text: getDueTimePlaceholder(language),
            type: 'plain_text',
          },
          type: 'timepicker',
        },
        label: {
          text: getDueTimeLabel(language),
          type: 'plain_text',
        },
        optional: true,
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
    callback_id: slackViewIds.taskEdit,
    close: {
      text: 'Close',
      type: 'plain_text',
    },
    private_metadata: buildEditTaskModalPrivateMetadata({ taskId: task.id }),
    submit: {
      text: getSubmitText(language),
      type: 'plain_text',
    },
    title: {
      text: getModalTitle(language),
      type: 'plain_text',
    },
    type: 'modal',
  };
};
