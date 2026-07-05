import type { SlackMembership, SlackUserLookup } from '#server/ports';
import { isRecoverableSlackAuthError } from '#server/utils';
import { WebClient } from '@slack/web-api';
import type {
  UsersInfoResponse,
  UsersLookupByEmailResponse,
} from '@slack/web-api';

type SlackApiUser =
  | NonNullable<UsersInfoResponse['user']>
  | NonNullable<UsersLookupByEmailResponse['user']>;

const getNonEmptyString = (value?: string): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

const toOkUserLookup = ({
  email,
  slackUserId,
  user,
}: {
  readonly email: string;
  readonly slackUserId: string;
  readonly user: SlackApiUser;
}): SlackUserLookup => {
  const displayName = getNonEmptyString(user.profile?.display_name);
  const realName = getNonEmptyString(user.profile?.real_name);

  return {
    status: 'ok',
    user: {
      ...(displayName === undefined ? {} : { displayName }),
      email,
      ...(realName === undefined ? {} : { realName }),
      slackUserId,
    },
  };
};

export const isSlackUserNotFoundError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false;
  }

  const { data } = error;

  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return false;
  }

  return data.error === 'users_not_found' || data.error === 'user_not_found';
};

export const toSlackUserLookup = ({
  user,
}: {
  readonly user?: SlackApiUser;
}): SlackUserLookup => {
  if (user?.id === undefined) {
    return { status: 'user_not_found' };
  }

  if (user.is_bot === true) {
    return { status: 'is_bot' };
  }

  if (user.deleted === true) {
    return { status: 'is_deleted' };
  }

  if (user.is_restricted === true) {
    return { status: 'is_restricted' };
  }

  if (user.is_ultra_restricted === true) {
    return { status: 'is_ultra_restricted' };
  }

  if ('is_stranger' in user && user.is_stranger) {
    return { status: 'is_stranger' };
  }

  const email = user.profile?.email;

  if (email === undefined || email.length === 0) {
    return { status: 'user_not_found' };
  }

  return toOkUserLookup({ email, slackUserId: user.id, user });
};

export const toSlackMembership = ({
  user,
}: {
  readonly user?: SlackApiUser;
}): SlackMembership => {
  if (user?.id === undefined) {
    return { status: 'not_member' };
  }

  if (user.is_bot === true || user.deleted === true) {
    return { status: 'not_member' };
  }

  if ('is_stranger' in user && user.is_stranger) {
    return { status: 'not_member' };
  }

  const email = user.profile?.email;

  if (email === undefined || email.length === 0) {
    return { status: 'not_member' };
  }

  return { slackUserId: user.id, status: 'member' };
};

const throwError = (error: unknown): never => {
  if (error instanceof Error) {
    throw error;
  }

  throw new Error('Slack API failed with a non-Error value.');
};

const toSlackMembershipError = (error: unknown): SlackMembership => {
  if (isRecoverableSlackAuthError(error)) {
    throwError(error);
  }

  return isSlackUserNotFoundError(error)
    ? { status: 'not_member' }
    : { status: 'indeterminate' };
};

export const verifySlackMembershipByEmail = ({
  botToken,
  email,
}: {
  readonly botToken: string;
  readonly email: string;
}): Promise<SlackMembership> =>
  new WebClient(botToken).users
    .lookupByEmail({ email })
    .then(
      (response): SlackMembership =>
        toSlackMembership({
          ...(response.user === undefined ? {} : { user: response.user }),
        })
    )
    .catch((error: unknown): SlackMembership => toSlackMembershipError(error));
