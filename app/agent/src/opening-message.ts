import type { CallPurpose, Language } from '@exe/domain';

// The first thing the agent says after a participant joins. Scheduled and manual
// (user-initiated) calls both jump straight into the regular meeting — the agent
// decides the content and leads; it never asks the user what the call should be.
// A user with a specific errand will simply say so, and the agent adapts.
export const buildOpeningMessage = ({
  focusTaskTitle,
  language,
  purpose,
}: {
  readonly focusTaskTitle?: string;
  readonly language: Language;
  readonly purpose: CallPurpose;
}): string => {
  if (focusTaskTitle !== undefined) {
    return language === 'en'
      ? `Let us update the task "${focusTaskTitle}". What should the new due date be, and why is it changing?`
      : `「${focusTaskTitle}」の変更ですね。期限をいつに変えるかと、理由を教えてください。`;
  }

  if (purpose === 'scheduled_review') {
    return language === 'en'
      ? 'Let us start the regular meeting.'
      : 'では、定例を始めます。';
  }

  return language === 'en'
    ? 'Let us start the meeting.'
    : 'では、ミーティングを始めます。';
};
