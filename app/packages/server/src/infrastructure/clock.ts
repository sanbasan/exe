import type { Clock } from '#server/ports';

export const systemClock: Clock = {
  now: (): string => new Date().toISOString(),
};
