import { invalidRequestError } from '#server/errors';
import type { SlackUserInfo, SlackUserLookup } from '#server/ports';

const getInvalidSlackUserMessage = ({
  identifier,
  status,
}: {
  readonly identifier: string;
  readonly status: Exclude<SlackUserLookup['status'], 'ok'>;
}): string => {
  switch (status) {
    case 'indeterminate':
      return `Could not verify ${identifier} in this Slack workspace.`;
    case 'is_bot':
      return 'Bot cannot be an admin';
    case 'is_deleted':
      return `${identifier} is a deleted user and cannot be an admin`;
    case 'is_restricted':
    case 'is_ultra_restricted':
      return `${identifier} is a guest user and cannot be an admin`;
    case 'is_stranger':
      return `${identifier} is an external user (Slack Connect) and cannot be an admin`;
    case 'user_not_found':
      return `${identifier} is not a member of this Slack workspace`;
  }
};

export const assertSlackUserLookup = ({
  identifier,
  lookup,
}: {
  readonly identifier: string;
  readonly lookup: SlackUserLookup;
}): SlackUserInfo => {
  if (lookup.status === 'ok') {
    return lookup.user;
  }

  throw invalidRequestError(
    getInvalidSlackUserMessage({ identifier, status: lookup.status })
  );
};
