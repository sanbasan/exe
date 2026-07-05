import type { SlackFile, SlackMessage } from '#server/ports';
import { WebClient } from '@slack/web-api';

const parseSlackMessageFile = (file: unknown): SlackFile | null => {
  if (typeof file !== 'object' || file === null) {
    return null;
  }

  const name =
    'name' in file && typeof file.name === 'string' && file.name.trim() !== ''
      ? file.name
      : undefined;
  const title =
    'title' in file &&
    typeof file.title === 'string' &&
    file.title.trim() !== ''
      ? file.title
      : undefined;

  if (name === undefined && title === undefined) {
    return null;
  }

  return {
    ...(name === undefined ? {} : { name }),
    ...(title === undefined ? {} : { title }),
  };
};

export const parseSlackReplyMessage = (
  message: unknown
): SlackMessage | null => {
  if (typeof message !== 'object' || message === null) {
    return null;
  }

  const text = 'text' in message ? message.text : undefined;
  const ts = 'ts' in message ? message.ts : undefined;
  const user = 'user' in message ? message.user : undefined;

  if (
    typeof text !== 'string' ||
    typeof ts !== 'string' ||
    typeof user !== 'string'
  ) {
    return null;
  }

  const files =
    'files' in message && Array.isArray(message.files)
      ? message.files.flatMap((file): readonly SlackFile[] => {
          const parsedFile = parseSlackMessageFile(file);

          return parsedFile === null ? [] : [parsedFile];
        })
      : [];

  return {
    ...(files.length === 0 ? {} : { files }),
    text,
    ts,
    user,
  };
};

export const getSlackReplies = async ({
  botToken,
  channelId,
  inclusive,
  latest,
  limit,
  threadTs,
}: {
  readonly botToken: string;
  readonly channelId: string;
  readonly inclusive: boolean;
  readonly latest: string;
  readonly limit: number;
  readonly threadTs: string;
}): Promise<readonly SlackMessage[]> => {
  const response = await new WebClient(botToken).conversations.replies({
    channel: channelId,
    inclusive,
    latest,
    limit,
    ts: threadTs,
  });

  return (response.messages ?? []).flatMap(
    (message): readonly SlackMessage[] => {
      const parsedMessage = parseSlackReplyMessage(message);

      return parsedMessage === null ? [] : [parsedMessage];
    }
  );
};
