import type { SlackOAuthInstallation } from '../src/ports';
import { buildWorkspaceFromInstallation } from '../src/services/slack-workspace-utils';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const installation: SlackOAuthInstallation = {
  accessToken: 'test-bot-token',
  authedUserId: 'UINSTALLER',
  botUserId: 'UBOT',
  teamId: 'T123',
  teamName: 'Workspace',
};

test('new Slack workspaces default to English and Asia/Tokyo', () => {
  const workspace = buildWorkspaceFromInstallation({
    clock: { now: () => '2026-06-28T00:00:00.000Z' },
    installation,
  });

  assert.equal(workspace.language, 'en');
  assert.equal(workspace.timezone, 'Asia/Tokyo');
});
