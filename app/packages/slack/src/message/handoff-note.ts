import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

// Handover document posted into the task's thread when an AI-initiated
// reassignment produced (or refreshed) a handoff note.

// Slack section text caps at 3000 chars.
const NOTE_TEXT_LIMIT = 2900;

const getHeaderText = dispatcher<Language, [taskTitle: string], string>({
  en: (taskTitle) =>
    `:page_facing_up: Handover note for "${taskTitle}" was updated.`,
  ja: (taskTitle) =>
    `:page_facing_up: 「${taskTitle}」の引き継ぎ書を更新しました。`,
});

// Language-independent Slack mention prefix, joined outside the dispatcher.
const mentionPrefix = (ids: readonly string[]): string =>
  ids.length === 0 ? '' : `${ids.map((id) => `<@${id}>`).join(' ')} `;

// Markdown headings don't render in Slack mrkdwn; downgrade them to bold.
const toMrkdwn = (note: string): string =>
  note
    .split('\n')
    .map((line) =>
      line.startsWith('#') ? `*${line.replace(/^#+\s*/u, '')}*` : line
    )
    .join('\n');

export const buildTaskHandoffNoteFallbackText = ({
  assigneeSlackUserIds,
  language,
  taskTitle,
}: {
  readonly assigneeSlackUserIds?: readonly string[];
  readonly language: Language;
  readonly taskTitle: string;
}): string =>
  `${mentionPrefix(assigneeSlackUserIds ?? [])}${getHeaderText(language)(taskTitle)}`;

export const buildTaskHandoffNoteBlocks = ({
  assigneeSlackUserIds,
  language,
  note,
  taskTitle,
}: {
  readonly assigneeSlackUserIds?: readonly string[];
  readonly language: Language;
  readonly note: string;
  readonly taskTitle: string;
}): readonly KnownBlock[] => [
  {
    text: {
      text: `${mentionPrefix(assigneeSlackUserIds ?? [])}${getHeaderText(language)(taskTitle)}`,
      type: 'mrkdwn',
    },
    type: 'section',
  },
  {
    text: {
      text: toMrkdwn(note).slice(0, NOTE_TEXT_LIMIT),
      type: 'mrkdwn',
    },
    type: 'section',
  },
];
