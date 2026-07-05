import type { KnownBlock } from '@slack/types';

// A blank context block used to add clear vertical spacing between App Home
// sections. Each section owns its own trailing spacer, so sections that render
// no blocks (e.g. an empty "Requested by you" list) leave no leftover gap.
export const homeSectionSpacerBlock = (): KnownBlock => ({
  elements: [{ text: ' ', type: 'mrkdwn' }],
  type: 'context',
});
