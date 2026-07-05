import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

const buildSectionBlocks = (text: string): readonly KnownBlock[] => [
  {
    text: {
      text,
      type: 'mrkdwn',
    },
    type: 'section',
  },
];

const getMeetingTasksRootText = dispatcher<
  Language,
  [meetingTitle: string, taskCount: number],
  string
>({
  en: (meetingTitle, taskCount) => {
    if (taskCount === 0) {
      return `:studio_microphone: Recording "${meetingTitle}" was processed.`;
    }

    return taskCount === 1
      ? `:memo: A task was created in "${meetingTitle}".`
      : `:memo: ${String(taskCount)} tasks were created in "${meetingTitle}".`;
  },
  ja: (meetingTitle, taskCount) => {
    if (taskCount === 0) {
      return `:studio_microphone: 「${meetingTitle}」の録音を処理しました。`;
    }

    return taskCount === 1
      ? `:memo: 「${meetingTitle}」内で、タスクが作成されました。`
      : `:memo: 「${meetingTitle}」内で、${String(taskCount)}件のタスクが作成されました。`;
  },
});

export const buildMeetingTasksRootFallbackText = ({
  language,
  meetingTitle,
  taskCount,
}: {
  readonly language: Language;
  readonly meetingTitle: string;
  readonly taskCount: number;
}): string => getMeetingTasksRootText(language)(meetingTitle, taskCount);

export const buildMeetingTasksRootBlocks = ({
  language,
  meetingTitle,
  taskCount,
}: {
  readonly language: Language;
  readonly meetingTitle: string;
  readonly taskCount: number;
}): readonly KnownBlock[] =>
  buildSectionBlocks(
    buildMeetingTasksRootFallbackText({ language, meetingTitle, taskCount })
  );

const getTaskDependencyNoticeText = dispatcher<
  Language,
  [blockerTitle: string, blockedTitle: string],
  string
>({
  en: (blockerTitle, blockedTitle) =>
    `:link: "${blockedTitle}" is blocked by "${blockerTitle}".`,
  ja: (blockerTitle, blockedTitle) =>
    `:link: 「${blockedTitle}」は「${blockerTitle}」にブロックされています。`,
});

export const buildTaskDependencyNoticeFallbackText = ({
  blockedTitle,
  blockerTitle,
  language,
}: {
  readonly blockedTitle: string;
  readonly blockerTitle: string;
  readonly language: Language;
}): string => getTaskDependencyNoticeText(language)(blockerTitle, blockedTitle);

export const buildTaskDependencyNoticeBlocks = ({
  blockedTitle,
  blockerTitle,
  language,
}: {
  readonly blockedTitle: string;
  readonly blockerTitle: string;
  readonly language: Language;
}): readonly KnownBlock[] =>
  buildSectionBlocks(
    buildTaskDependencyNoticeFallbackText({
      blockedTitle,
      blockerTitle,
      language,
    })
  );

const getTaskReassignedNoticeText = dispatcher<
  Language,
  [taskTitle: string, fromDisplayName: string, toDisplayName?: string],
  string
>({
  en: (taskTitle, fromDisplayName, toDisplayName) =>
    `:leftwards_arrow_with_hook: "${taskTitle}" was reassigned from ${fromDisplayName} to ${
      toDisplayName ?? 'unassigned'
    }.`,
  ja: (taskTitle, fromDisplayName, toDisplayName) =>
    `:leftwards_arrow_with_hook: 「${taskTitle}」の担当が ${fromDisplayName} から ${
      toDisplayName ?? '未割り当て'
    } に変更されました。`,
});

export const buildTaskReassignedNoticeFallbackText = ({
  fromDisplayName,
  language,
  taskTitle,
  toDisplayName,
}: {
  readonly fromDisplayName: string;
  readonly language: Language;
  readonly taskTitle: string;
  readonly toDisplayName?: string;
}): string =>
  getTaskReassignedNoticeText(language)(
    taskTitle,
    fromDisplayName,
    toDisplayName
  );

export const buildTaskReassignedNoticeBlocks = ({
  fromDisplayName,
  language,
  taskTitle,
  toDisplayName,
}: {
  readonly fromDisplayName: string;
  readonly language: Language;
  readonly taskTitle: string;
  readonly toDisplayName?: string;
}): readonly KnownBlock[] =>
  buildSectionBlocks(
    buildTaskReassignedNoticeFallbackText({
      fromDisplayName,
      language,
      taskTitle,
      ...(toDisplayName === undefined ? {} : { toDisplayName }),
    })
  );
