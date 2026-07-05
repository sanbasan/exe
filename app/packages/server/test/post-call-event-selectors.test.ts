import {
  getIncomingFollowUpDrafts,
  getIncomingPatches,
  getIncomingWorkTaskDrafts,
} from '../src/workflows/post-call-event-selectors';
import { callEventSchema } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-29T00:00:00.000Z';

const patch = {
  after: {
    kind: 'work',
    status: 'completed',
  },
  before: {
    kind: 'work',
    status: 'active',
    title: 'Ship UI',
  },
  taskId: 'task-1',
} as const;

const correctedPatch = {
  after: {
    kind: 'work',
    status: 'blocked',
  },
  before: {
    kind: 'work',
    status: 'completed',
    title: 'Ship UI',
  },
  taskId: 'task-1',
} as const;

const draft = {
  assigneeSlackUserIds: ['U_ASSIGNEE'],
  followUpQuestion: 'Can we ship this?',
  requesterSlackUserIds: ['U_USER'],
  title: 'Confirm shipping',
} as const;

const workDraft = {
  assigneeSlackUserIds: ['U_ASSIGNEE'],
  channelId: 'C_PROJECT',
  requesterSlackUserIds: ['U_USER'],
  title: 'Prepare release notes',
} as const;

const event = ({
  id,
  payload,
  type,
}: {
  readonly id: string;
  readonly payload: unknown;
  readonly type: string;
}) =>
  callEventSchema.parse({
    callSessionId: 'call-1',
    createdAt: NOW,
    id,
    payload,
    type,
    workspaceId: 'T_WORKSPACE',
  });

void test('incoming selectors include proposed changes without approval events', () => {
  const events = [
    event({
      id: 'event-1',
      payload: { patches: [patch] },
      type: 'task_patch_proposed',
    }),
    event({
      id: 'event-2',
      payload: { drafts: [draft] },
      type: 'follow_up_task_draft_proposed',
    }),
  ];

  assert.deepEqual(getIncomingPatches(events), [patch]);
  assert.deepEqual(getIncomingFollowUpDrafts(events), [draft]);
});

void test('incoming selectors include proposed work task drafts', () => {
  const events = [
    event({
      id: 'event-1',
      payload: { workTaskDrafts: [workDraft] },
      type: 'work_task_draft_proposed',
    }),
  ];

  assert.deepEqual(getIncomingWorkTaskDrafts(events), [workDraft]);
});

void test('incoming selectors dedupe proposed and legacy approved changes', () => {
  const events = [
    event({
      id: 'event-1',
      payload: { patches: [patch] },
      type: 'task_patch_proposed',
    }),
    event({
      id: 'event-2',
      payload: { patches: [patch] },
      type: 'task_patch_approved',
    }),
    event({
      id: 'event-3',
      payload: { drafts: [draft] },
      type: 'follow_up_task_draft_proposed',
    }),
    event({
      id: 'event-4',
      payload: { drafts: [draft] },
      type: 'follow_up_task_draft_approved',
    }),
    event({
      id: 'event-5',
      payload: { workTaskDrafts: [workDraft] },
      type: 'work_task_draft_proposed',
    }),
    event({
      id: 'event-6',
      payload: { workTaskDrafts: [workDraft] },
      type: 'work_task_draft_approved',
    }),
  ];

  assert.deepEqual(getIncomingPatches(events), [patch]);
  assert.deepEqual(getIncomingFollowUpDrafts(events), [draft]);
  assert.deepEqual(getIncomingWorkTaskDrafts(events), [workDraft]);
});

void test('incoming selectors include legacy approved-only changes', () => {
  const events = [
    event({
      id: 'event-1',
      payload: { patches: [patch] },
      type: 'task_patch_approved',
    }),
    event({
      id: 'event-2',
      payload: { drafts: [draft] },
      type: 'follow_up_task_draft_approved',
    }),
    event({
      id: 'event-3',
      payload: { workTaskDrafts: [workDraft] },
      type: 'work_task_draft_approved',
    }),
  ];

  assert.deepEqual(getIncomingPatches(events), [patch]);
  assert.deepEqual(getIncomingFollowUpDrafts(events), [draft]);
  assert.deepEqual(getIncomingWorkTaskDrafts(events), [workDraft]);
});

void test('incoming selectors keep correction patches for the same task in order', () => {
  const events = [
    event({
      id: 'event-1',
      payload: { patches: [patch] },
      type: 'task_patch_proposed',
    }),
    event({
      id: 'event-2',
      payload: { patches: [correctedPatch] },
      type: 'task_patch_proposed',
    }),
  ];

  assert.deepEqual(getIncomingPatches(events), [patch, correctedPatch]);
});

void test('incoming selectors ignore follow-up drafts without assignees', () => {
  const missingAssigneeDraft = {
    followUpQuestion: 'Who should answer this?',
    requesterSlackUserIds: ['U_USER'],
    title: 'Find owner',
  } as const;
  const emptyAssigneeDraft = {
    ...draft,
    assigneeSlackUserIds: [],
    title: 'Empty owner list',
  } as const;
  const events = [
    event({
      id: 'event-1',
      payload: { drafts: [missingAssigneeDraft, emptyAssigneeDraft, draft] },
      type: 'follow_up_task_draft_proposed',
    }),
  ];

  assert.deepEqual(getIncomingFollowUpDrafts(events), [draft]);
});

void test('incoming selectors ignore work task drafts without assignees', () => {
  const emptyAssigneeDraft = {
    ...workDraft,
    assigneeSlackUserIds: [],
    title: 'Empty owner list',
  } as const;
  const events = [
    event({
      id: 'event-1',
      payload: { workTaskDrafts: [emptyAssigneeDraft, workDraft] },
      type: 'work_task_draft_proposed',
    }),
  ];

  assert.deepEqual(getIncomingWorkTaskDrafts(events), [workDraft]);
});
