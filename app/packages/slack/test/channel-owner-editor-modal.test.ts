import {
  buildChannelOwnerEditorModal,
  slackActionIds,
  slackBlockIds,
} from '../src';
import type { Channel } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const buildChannel = (overrides: Partial<Channel>): Channel => ({
  assigneeSlackUserIds: ['UOWNER1'],
  channelId: 'C123',
  createdAt: '2026-06-27T00:00:00.000Z',
  createdBySlackUserId: 'UCREATOR',
  name: 'general',
  status: 'active',
  updatedAt: '2026-06-27T00:00:00.000Z',
  watcherSlackUserIds: [],
  workspaceId: 'T123',
  ...overrides,
});

test('unselected modal shows channel select and invite note without submit', () => {
  const view = buildChannelOwnerEditorModal({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
    language: 'ja',
  });

  const channelSelectBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.channelOwnerEditorChannel
  );
  const inviteNoteBlock = view.blocks.find(
    (block) =>
      block.type === 'context' &&
      block.elements.some(
        (element) =>
          element.type === 'mrkdwn' &&
          element.text.includes('@exe を招待してください')
      )
  );

  assert.equal(view.submit, undefined);
  assert.equal(channelSelectBlock?.type, 'input');
  assert.equal(channelSelectBlock?.element.type, 'static_select');
  assert.equal(
    channelSelectBlock?.element.action_id,
    slackActionIds.channelOwnerEditorChannel
  );
  assert.notEqual(inviteNoteBlock, undefined);
});

test('selected modal shows owners select with current assignees and private metadata', () => {
  const selectedChannel = buildChannel({
    assigneeSlackUserIds: ['UOWNER1', 'UOWNER2'],
    channelId: 'C1',
    name: 'general',
  });
  const view = buildChannelOwnerEditorModal({
    channels: [selectedChannel],
    language: 'ja',
    selectedChannel,
  });

  const assigneeBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.channelOwnerEditorAssignees
  );

  assert.equal(assigneeBlock?.type, 'input');
  assert.equal(assigneeBlock?.element.type, 'multi_users_select');
  assert.deepEqual(assigneeBlock?.element.initial_users, [
    'UOWNER1',
    'UOWNER2',
  ]);
  assert.equal(view.private_metadata, 'C1');
  assert.equal(view.submit?.text, '保存');
});

test('zero-channel modal does not include submit', () => {
  const view = buildChannelOwnerEditorModal({
    channels: [],
    language: 'ja',
  });

  assert.equal(view.submit, undefined);
});

test('selected modal omits initial_users when channel has no owners', () => {
  const selectedChannel = buildChannel({
    assigneeSlackUserIds: [],
    channelId: 'C1',
    name: 'general',
  });
  const view = buildChannelOwnerEditorModal({
    channels: [selectedChannel],
    language: 'ja',
    selectedChannel,
  });

  const assigneeBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.channelOwnerEditorAssignees
  );

  assert.equal(assigneeBlock?.type, 'input');
  assert.equal(assigneeBlock?.element.type, 'multi_users_select');
  assert.equal('initial_users' in assigneeBlock.element, false);
});
