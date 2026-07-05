// Single source of truth for email normalization. Used both when writing the
// Slack membership index and when reading it back at login, so the write key
// and read key can never diverge.
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
