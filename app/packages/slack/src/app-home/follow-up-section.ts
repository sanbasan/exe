import { homeSectionSpacerBlock } from '#slack/app-home/blocks';
import { getFollowUpHeading } from '#slack/app-home/copy';
import { slackBlockIds } from '#slack/contracts/ids';
import type { FollowUpTask, Language } from '@exe/domain';
import type { KnownBlock } from '@slack/types';

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

const formatFollowUpTask = (task: FollowUpTask): string =>
  `• *${task.title}*\n  ${task.followUpQuestion}`;

export const buildFollowUpSection = ({
  followUpTasks,
  language,
}: {
  readonly followUpTasks: readonly FollowUpTask[];
  readonly language: Language;
}): readonly KnownBlock[] => {
  if (followUpTasks.length === 0) {
    return [];
  }

  return [
    headerBlock(getFollowUpHeading(language)),
    sectionBlock({
      blockId: slackBlockIds.followUpTasks,
      text: followUpTasks.map(formatFollowUpTask).join('\n'),
    }),
    dividerBlock(),
    homeSectionSpacerBlock(),
  ];
};
