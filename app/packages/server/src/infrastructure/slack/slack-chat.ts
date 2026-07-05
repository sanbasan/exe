import type { KnownBlock } from '@slack/types';
import { WebClient } from '@slack/web-api';

export const deleteSlackMessage = async ({
  botToken,
  channelId,
  messageTs,
}: {
  readonly botToken: string;
  readonly channelId: string;
  readonly messageTs: string;
}): Promise<void> => {
  await new WebClient(botToken).chat.delete({
    channel: channelId,
    ts: messageTs,
  });
};

export const postSlackMessage = async ({
  blocks,
  botToken,
  channelId,
  text,
  threadTs,
  unfurlLinks,
}: {
  readonly blocks: readonly KnownBlock[];
  readonly botToken: string;
  readonly channelId: string;
  readonly text: string;
  readonly threadTs?: string;
  readonly unfurlLinks?: boolean;
}): Promise<string> => {
  const response = await new WebClient(botToken).chat.postMessage({
    blocks: [...blocks],
    channel: channelId,
    text,
    ...(threadTs === undefined ? {} : { thread_ts: threadTs }),
    ...(unfurlLinks === undefined ? {} : { unfurl_links: unfurlLinks }),
  });
  const messageTs = response.ts;

  if (messageTs === undefined || messageTs.length === 0) {
    throw new Error('Slack postMessage response is missing ts.');
  }

  return messageTs;
};

export const updateSlackMessage = async ({
  blocks,
  botToken,
  channelId,
  messageTs,
  text,
}: {
  readonly blocks: readonly KnownBlock[];
  readonly botToken: string;
  readonly channelId: string;
  readonly messageTs: string;
  readonly text: string;
}): Promise<void> => {
  await new WebClient(botToken).chat.update({
    blocks: [...blocks],
    channel: channelId,
    text,
    ts: messageTs,
  });
};
