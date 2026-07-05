import { buildAssistantSystemPrompt } from '#agent/assistant/system-prompt';
import { buildCallAgenda } from '@exe/domain';
import type { CallAgenda, Channel, Task } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ASSIGNEE = 'U_ASSIGNEE';

const channel: Channel = {
  assigneeSlackUserIds: [ASSIGNEE],
  channelId: 'C_OWNED',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBySlackUserId: 'U_OWNER',
  name: 'owned-project',
  status: 'active',
  updatedAt: '2026-06-01T00:00:00.000Z',
  watcherSlackUserIds: [],
  workspaceId: 'workspace_1',
};

const workTask: Task = {
  assigneeSlackUserIds: [ASSIGNEE],
  channelId: 'C_OWNED',
  completedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  dependentTaskIds: [],
  dependsOnTaskIds: [],
  dueAt: '2026-06-20T03:00:00.000Z',
  id: 'task_1',
  kind: 'work',
  requesterSlackUserIds: ['U_REQUESTER'],
  status: 'active',
  title: 'API仕様書のレビュー',
  updatedAt: '2026-06-01T00:00:00.000Z',
  workspaceId: 'workspace_1',
};

const buildAgenda = ({
  purpose = 'scheduled_review',
}: {
  readonly purpose?: CallAgenda['purpose'];
} = {}): CallAgenda =>
  buildCallAgenda({
    channels: [channel],
    language: 'ja',
    now: '2026-06-15T00:00:00.000Z',
    purpose,
    slackUserId: ASSIGNEE,
    tasks: [workTask],
    timezone: 'Asia/Tokyo',
  });

void test('assistant prompt frames the role, context, and report format', () => {
  const prompt = buildAssistantSystemPrompt({ agenda: buildAgenda() });

  assert.match(prompt, /background action assistant/);
  assert.match(prompt, /transcript of the call so far/);
  assert.match(prompt, /workspace language is Japanese/);
  assert.match(prompt, /workspace timezone is Asia\/Tokyo/);
  assert.match(prompt, /# Report format/);
  assert.match(prompt, /1-3 short sentences/);
});

void test('assistant prompt carries the recording rules and task lists', () => {
  const prompt = buildAssistantSystemPrompt({ agenda: buildAgenda() });

  assert.match(prompt, /applied automatically after the call/);
  assert.match(prompt, /Never invent an ID/);
  assert.match(prompt, /never pass \[\]/);
  assert.match(prompt, /list_pending_drafts/);
  assert.match(prompt, /discard_pending_draft/);
  assert.match(prompt, /nextCheckReason is required/);
  assert.match(prompt, /dueAt: "none"/);
  assert.match(prompt, /API仕様書のレビュー \(task ID: task_1\)/);
  assert.match(prompt, /1\. #owned-project \(channel ID: C_OWNED\)/);
});

void test('assistant prompt states the call purpose and target-channel handling', () => {
  const scheduled = buildAssistantSystemPrompt({ agenda: buildAgenda() });

  assert.match(
    scheduled,
    /This is the regular scheduled review call, organized channel by channel\./
  );
  assert.match(
    scheduled,
    /When your message includes a "## Target channel" section/
  );
  assert.match(scheduled, /the work concerns that channel/);

  const manual = buildAssistantSystemPrompt({
    agenda: buildAgenda({ purpose: 'manual_review' }),
  });

  assert.match(
    manual,
    /This call was started manually by the user \(not on the regular schedule\)\./
  );
});

void test('assistant prompt resolves member names and includes the speaker', () => {
  const agenda: CallAgenda = {
    ...buildAgenda(),
    speakerName: 'Taro Yamada',
  };
  const prompt = buildAssistantSystemPrompt({
    agenda,
    members: [{ id: ASSIGNEE, profile: { display_name: '田中 太郎' } }],
  });

  assert.match(prompt, /Taro Yamada \(Slack user ID: U_ASSIGNEE\)/);
  assert.match(prompt, /- 田中 太郎 \(Slack user ID: U_ASSIGNEE\)/);
});

void test('assistant prompt tells the model not to guess on ambiguity', () => {
  const prompt = buildAssistantSystemPrompt({ agenda: buildAgenda() });

  assert.match(prompt, /do NOT guess/);
  assert.match(prompt, /exact question the user must answer/);
});
