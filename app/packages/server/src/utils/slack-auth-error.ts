const RECOVERABLE_SLACK_AUTH_ERRORS = new Set([
  'invalid_auth',
  'token_expired',
  'token_revoked',
]);

export const isRecoverableSlackAuthError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false;
  }

  const data = error.data;

  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return false;
  }

  const slackError = data.error;

  return (
    typeof slackError === 'string' &&
    RECOVERABLE_SLACK_AUTH_ERRORS.has(slackError)
  );
};
