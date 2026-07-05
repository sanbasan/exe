import { slackBlockIds } from '#slack/contracts/ids';

const REFERENCE_SEPARATOR = ':';

/**
 * The reschedule dropdown (a `static_select`) cannot carry the signed call-run
 * reference in its option values, which Slack caps at 75 characters. Instead we
 * stash the reference in the surrounding actions block's `block_id`, which
 * allows up to 255 characters, and recover it when handling the interaction.
 */
export const buildScheduledCallRunActionsBlockId = (
  reference: string
): string =>
  `${slackBlockIds.scheduledCallRunReschedule}${REFERENCE_SEPARATOR}${reference}`;

export const parseScheduledCallRunReferenceFromBlockId = (
  blockId: string
): string | null => {
  const prefix = `${slackBlockIds.scheduledCallRunReschedule}${REFERENCE_SEPARATOR}`;

  if (!blockId.startsWith(prefix)) {
    return null;
  }

  const reference = blockId.slice(prefix.length);

  return reference.length === 0 ? null : reference;
};
