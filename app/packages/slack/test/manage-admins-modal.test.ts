import { buildManageAdminsModal, slackActionIds, slackBlockIds } from '../src';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('account management modal shows admin and channel-owner-editor selectors', () => {
  const view = buildManageAdminsModal({
    adminSlackUserIds: ['UCURRENT', 'UADMIN', 'UBOTH'],
    channelOwnerEditorSlackUserIds: ['UEDITOR', 'UBOTH'],
    currentUserDisplayName: 'current',
    currentUserSlackUserId: 'UCURRENT',
    language: 'ja',
  });
  const adminBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.manageAdminsUsers
  );
  const editorBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.manageAdminsChannelOwnerEditors
  );

  assert.equal(view.title.text, 'アカウント管理');
  assert.equal(adminBlock?.type, 'input');
  assert.equal(adminBlock?.element.type, 'multi_users_select');
  assert.equal(adminBlock.element.action_id, slackActionIds.manageAdminsUsers);
  assert.deepEqual(adminBlock.element.initial_users, ['UADMIN', 'UBOTH']);
  assert.equal(editorBlock?.type, 'input');
  assert.equal(editorBlock?.element.type, 'multi_users_select');
  assert.equal(
    editorBlock.element.action_id,
    slackActionIds.manageAdminsChannelOwnerEditors
  );
  assert.deepEqual(editorBlock.element.initial_users, ['UEDITOR']);
});
