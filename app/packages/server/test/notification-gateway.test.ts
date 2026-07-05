import { dedupeDeviceTokens } from '../src/infrastructure/notifications/notification-gateway';
import { type DeviceToken } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const buildToken = ({
  id,
  token,
}: {
  readonly id: string;
  readonly token: string;
}): DeviceToken => ({
  createdAt: '2026-07-01T00:00:00.000Z',
  environment: 'prod',
  id,
  kind: 'voip',
  platform: 'ios',
  token,
  updatedAt: '2026-07-01T00:00:00.000Z',
  userId: 'user-1',
});

test('dedupeDeviceTokens keeps only one entry for a repeated token value', () => {
  const tokens = [
    buildToken({ id: 'old-random-id-1', token: 'token-a' }),
    buildToken({ id: 'old-random-id-2', token: 'token-a' }),
    buildToken({ id: 'token-b-id', token: 'token-b' }),
  ];

  assert.deepEqual(dedupeDeviceTokens(tokens), [tokens[0], tokens[2]]);
});
