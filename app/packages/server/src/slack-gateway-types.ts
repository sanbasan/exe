import type {
  SlackWorkspaceMember as SlackWorkspaceMemberPayload,
  SlackWorkspaceTeam,
} from '@exe/domain';

export interface SlackOAuthInstallation {
  readonly accessToken: string;
  readonly authedUserId: string;
  readonly botUserId: string;
  readonly expiresInSeconds?: number;
  readonly refreshToken?: string;
  readonly teamId: string;
  readonly teamName?: string;
}

export interface SlackBotTokenRefresh {
  readonly accessToken: string;
  readonly expiresInSeconds?: number;
  readonly refreshToken?: string;
}

export interface SlackMessageReference {
  readonly channelId: string;
  readonly messageTs: string;
}

export interface ChannelBlockCreatedFromCallMessageReference {
  readonly blockId: string;
  readonly channelId: string;
  readonly messageTs: string;
  readonly threadTs: string;
}

export interface TaskCreatedFromCallMessageReference {
  readonly channelId: string;
  readonly messageTs: string;
  readonly taskId: string;
  readonly threadTs: string;
}

export interface CallSummaryChannelUpdate {
  readonly channelId: string;
  readonly channelName: string;
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly statusText: string;
}

/**
 * Result of a live Slack membership check by email.
 *
 * - `member`: the email maps to an active, non-bot Slack user in the workspace,
 *   including single-channel and multi-channel guests.
 * - `not_member`: Slack definitively says the email is not a usable member
 *   (no such user, deactivated, a bot, or Slack Connect external user). Callers
 *   may prune cached access.
 * - `indeterminate`: the check could not be completed (API/network/token
 *   error). Callers should fail open (trust the cache) rather than revoke.
 */
export type SlackMembership =
  | { readonly slackUserId: string; readonly status: 'member' }
  | { readonly status: 'indeterminate' }
  | { readonly status: 'not_member' };

export interface SlackChannelInfo {
  readonly id: string;
  readonly isIm: boolean;
  readonly isMember?: boolean;
  readonly isMpim?: boolean;
  readonly isArchived?: boolean;
  readonly isPrivate?: boolean;
  readonly name: string;
}

/**
 * Result of a live lookup of the Slack channels a given user has joined
 * (public or private), used to resolve per-user channel visibility.
 *
 * - `ok`: `channelIds` lists every channel the user is a member of.
 * - `user_not_found`: Slack definitively says the user does not exist.
 * - `indeterminate`: the check could not be completed (API/network/token
 *   error). Callers must NOT fail open on this status.
 */
export type SlackUserConversations =
  | { readonly channelIds: readonly string[]; readonly status: 'ok' }
  | { readonly status: 'indeterminate' }
  | { readonly status: 'user_not_found' };

export interface SlackUserInfo {
  readonly displayName?: string;
  readonly email: string;
  readonly realName?: string;
  readonly slackUserId: string;
}

export type SlackUserLookup =
  | { readonly status: 'ok'; readonly user: SlackUserInfo }
  | {
      readonly status:
        | 'indeterminate'
        | 'is_bot'
        | 'is_deleted'
        | 'is_restricted'
        | 'is_stranger'
        | 'is_ultra_restricted'
        | 'user_not_found';
    };

export type SlackWorkspaceMember = SlackWorkspaceMemberPayload;

export type SlackWorkspaceInfo = SlackWorkspaceTeam;

export interface SlackFile {
  readonly name?: string;
  readonly title?: string;
}

export interface SlackMessage {
  readonly files?: readonly SlackFile[];
  readonly text: string;
  readonly ts: string;
  readonly user: string;
}
