export interface TaskMessageUser {
  readonly displayName?: string;
  readonly realName?: string;
  readonly slackUserId: string;
}

export const getUserText = (user: TaskMessageUser): string => {
  if (user.displayName !== undefined && user.displayName.length > 0) {
    return `@${user.displayName}`;
  }

  if (user.realName !== undefined && user.realName.length > 0) {
    return `@${user.realName}`;
  }

  return `<@${user.slackUserId}>`;
};
