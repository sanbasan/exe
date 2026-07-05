import type { IdGenerator } from '#server/ports';
import { randomUUID } from 'node:crypto';

export const randomIdGenerator: IdGenerator = {
  generateId: (): string => randomUUID(),
};
