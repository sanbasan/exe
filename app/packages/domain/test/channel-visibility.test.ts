import {
  canAccessChannel,
  channelSchema,
  type Channel,
  type ChannelVisibilityContext,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';

const buildChannel = (overrides: Partial<Channel> = {}): Channel =>
  channelSchema.parse({
    assigneeSlackUserIds: [],
    channelId: 'C_TARGET',
    createdAt: NOW,
    createdBySlackUserId: 'U_CREATOR',
    name: 'general',
    status: 'active',
    updatedAt: NOW,
    watcherSlackUserIds: [],
    workspaceId: 'T_WORKSPACE',
    ...overrides,
  });

const visibility = (
  overrides: Partial<ChannelVisibilityContext> = {}
): ChannelVisibilityContext => ({
  isGuest: false,
  joinedChannelIds: new Set(),
  ...overrides,
});

void test('canAccessChannel allows a channel the user has actually joined', () => {
  const channel = buildChannel({ isPrivate: true });

  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({ joinedChannelIds: new Set(['C_TARGET']) }),
    }),
    true
  );
});

void test('canAccessChannel allows a public channel a non-guest could self-join', () => {
  const channel = buildChannel({ isPrivate: false });

  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({ isGuest: false }),
    }),
    true
  );
});

void test('canAccessChannel denies a public channel to a guest who has not joined it', () => {
  const channel = buildChannel({ isPrivate: false });

  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({ isGuest: true }),
    }),
    false
  );
});

void test('canAccessChannel denies a private channel the user has not joined', () => {
  const channel = buildChannel({ isPrivate: true });

  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({ isGuest: false }),
    }),
    false
  );
});

void test('canAccessChannel treats an unsynced isPrivate as private (fail-closed)', () => {
  const channel = buildChannel();

  assert.equal(channel.isPrivate, undefined);
  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({ isGuest: false }),
    }),
    false
  );
  assert.equal(
    canAccessChannel({
      channel,
      visibility: visibility({
        isGuest: false,
        joinedChannelIds: new Set(['C_TARGET']),
      }),
    }),
    true
  );
});
