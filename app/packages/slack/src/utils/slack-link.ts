const normalizeSlackDomain = (slackDomain: string): string => {
  if (slackDomain === '') {
    return 'slack.com';
  }

  if (slackDomain.endsWith('.slack.com')) {
    return slackDomain;
  }

  return `${slackDomain}.slack.com`;
};

// https://{domain}/archives/{channelId}/p{messageTs}?thread_ts={threadTs}&cid={channelId}
export const slackMessageUrl = ({
  channelId,
  messageTs,
  slackDomain,
  threadTs,
}: {
  readonly channelId: string;
  readonly messageTs: string;
  readonly slackDomain: string;
  readonly threadTs?: string;
}): string => {
  const base = `https://${normalizeSlackDomain(slackDomain)}/archives/${channelId}/p${messageTs.replace('.', '')}`;

  return threadTs !== undefined
    ? `${base}?thread_ts=${threadTs}&cid=${channelId}`
    : base;
};
