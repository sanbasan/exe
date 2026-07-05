import {
  applyTaskPatch,
  calculateNextRunAt,
  callScheduleSchema,
  createFollowUpTaskFromDraft,
  createWorkTaskFromDraft,
  followUpTaskDraftSchema,
  followUpTaskSchema,
  getOpenFollowUpTasksForAssignee,
  getOpenWorkTasksForAssignee,
  taskSchema,
  workTaskDraftSchema,
  workTaskSchema,
  type CallSchedule,
  type FollowUpTask,
  type FollowUpTaskDraft,
  type Task,
  type WorkTaskDraft,
  type WorkTask,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-15T00:00:00.000Z';
const LATER = '2026-06-15T00:10:00.000Z';
const WORKSPACE_ID = 'workspace_1';
const ASSIGNEE_SLACK_USER_ID = 'U_ASSIGNEE';
const OTHER_SLACK_USER_ID = 'U_OTHER';
const REQUESTER_SLACK_USER_ID = 'U_REQUESTER';

const buildWorkTask = (overrides: Partial<WorkTask> = {}): WorkTask =>
  workTaskSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_SLACK_USER_ID],
    createdAt: NOW,
    id: 'work_task_1',
    kind: 'work',
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    status: 'active',
    title: 'Ship the task model',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const buildFollowUpTask = (
  overrides: Partial<FollowUpTask> = {}
): FollowUpTask =>
  followUpTaskSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_SLACK_USER_ID],
    createdAt: NOW,
    followUpQuestion: 'Can we close this?',
    id: 'follow_up_task_1',
    kind: 'follow_up',
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    status: 'active',
    title: 'Confirm task state',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const buildSchedule = (overrides: Partial<CallSchedule> = {}): CallSchedule =>
  callScheduleSchema.parse({
    createdAt: NOW,
    enabled: true,
    excludedDates: [],
    id: 'call_schedule_1',
    preNotifyMinutes: 5,
    timeOfDay: '09:00',
    timezone: 'Asia/Tokyo',
    updatedAt: NOW,
    userId: 'user_1',
    weekdays: [1],
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

void test('Task union keeps work and follow-up task boundaries', () => {
  const workTask = buildWorkTask({
    channelId: 'channel_1',
    id: 'work_task_1',
  });
  const followUpTask = buildFollowUpTask({
    id: 'follow_up_task_1',
    sourceTaskId: workTask.id,
  });
  const tasks: readonly Task[] = [
    workTask,
    buildWorkTask({
      assigneeSlackUserIds: [OTHER_SLACK_USER_ID],
      id: 'work_task_2',
    }),
    followUpTask,
    buildFollowUpTask({
      id: 'follow_up_task_2',
      status: 'completed',
    }),
  ];

  assert.equal(taskSchema.parse(workTask).kind, 'work');
  assert.equal(taskSchema.parse(followUpTask).kind, 'follow_up');
  const parsedLegacyFollowUp = followUpTaskSchema.parse({
    ...followUpTask,
    description: 'Legacy description',
    followUpAnsweredAt: LATER,
  });
  assert.equal(Object.hasOwn(parsedLegacyFollowUp, 'description'), false);
  assert.equal(
    Object.hasOwn(parsedLegacyFollowUp, 'followUpAnsweredAt'),
    false
  );
  assert.deepEqual(
    getOpenWorkTasksForAssignee({
      slackUserId: ASSIGNEE_SLACK_USER_ID,
      tasks,
    }).map((task) => task.id),
    ['work_task_1']
  );
  assert.deepEqual(
    getOpenFollowUpTasksForAssignee({
      slackUserId: ASSIGNEE_SLACK_USER_ID,
      tasks,
    }).map((task) => task.id),
    ['follow_up_task_1']
  );
});

void test('Task patches cannot cross task kinds and normalize completion time', () => {
  const workTask = buildWorkTask();
  const completed = applyTaskPatch({
    now: LATER,
    patch: {
      after: {
        kind: 'work',
        status: 'completed',
      },
      taskId: workTask.id,
    },
    task: workTask,
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, LATER);
  assert.throws(
    () =>
      applyTaskPatch({
        now: LATER,
        patch: {
          after: {
            kind: 'follow_up',
            status: 'completed',
          },
          taskId: workTask.id,
        },
        task: workTask,
      }),
    /Task patch kind does not match task kind/u
  );
});

void test('Follow-up task drafts require an assignee before task creation', () => {
  const draft = followUpTaskDraftSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_SLACK_USER_ID],
    channelId: 'C_TARGET',
    followUpQuestion: 'Is the deployment checklist complete?',
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    sourceTaskId: 'work_task_1',
    title: 'Confirm deployment checklist',
  });
  const task = createFollowUpTaskFromDraft({
    draft,
    id: 'follow_up_task_3',
    now: NOW,
    workspaceId: WORKSPACE_ID,
  });
  const unassignedDraft: FollowUpTaskDraft = followUpTaskDraftSchema.parse({
    followUpQuestion: 'Who owns this?',
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    title: 'Find owner',
  });

  assert.equal(task.kind, 'follow_up');
  assert.deepEqual(task.assigneeSlackUserIds, [ASSIGNEE_SLACK_USER_ID]);
  assert.throws(
    () =>
      createFollowUpTaskFromDraft({
        draft: unassignedDraft,
        id: 'follow_up_task_4',
        now: NOW,
        workspaceId: WORKSPACE_ID,
      }),
    /Follow-up task requires assigneeSlackUserIds/u
  );
});

void test('Work task drafts require assignees and requesters before task creation', () => {
  const draft = workTaskDraftSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_SLACK_USER_ID],
    channelId: 'C_TARGET',
    dueAt: '2026-06-20T09:00:00.000Z',
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    title: 'Prepare launch checklist',
  });
  const task = createWorkTaskFromDraft({
    draft,
    id: 'work_task_3',
    now: NOW,
    workspaceId: WORKSPACE_ID,
  });
  const unassignedDraft: WorkTaskDraft = workTaskDraftSchema.parse({
    assigneeSlackUserIds: [],
    requesterSlackUserIds: [REQUESTER_SLACK_USER_ID],
    title: 'Find owner',
  });
  const noRequesterDraft: WorkTaskDraft = workTaskDraftSchema.parse({
    assigneeSlackUserIds: [ASSIGNEE_SLACK_USER_ID],
    requesterSlackUserIds: [],
    title: 'Find requester',
  });

  assert.equal(task.kind, 'work');
  assert.deepEqual(task.assigneeSlackUserIds, [ASSIGNEE_SLACK_USER_ID]);
  assert.equal(task.channelId, 'C_TARGET');
  assert.equal(task.dueAt, '2026-06-20T09:00:00.000Z');
  assert.throws(
    () =>
      createWorkTaskFromDraft({
        draft: unassignedDraft,
        id: 'work_task_4',
        now: NOW,
        workspaceId: WORKSPACE_ID,
      }),
    /Work task requires assigneeSlackUserIds/u
  );
  assert.throws(
    () =>
      createWorkTaskFromDraft({
        draft: noRequesterDraft,
        id: 'work_task_5',
        now: NOW,
        workspaceId: WORKSPACE_ID,
      }),
    /Work task requires requesterSlackUserIds/u
  );
});

void test('Scheduled calls skip excluded dates and disabled schedules', () => {
  assert.equal(
    calculateNextRunAt({
      after: new Date('2026-06-14T23:30:00.000Z'),
      schedule: buildSchedule(),
    }),
    '2026-06-15T00:00:00.000Z'
  );
  assert.equal(
    calculateNextRunAt({
      after: new Date('2026-06-14T23:30:00.000Z'),
      schedule: buildSchedule({ excludedDates: ['2026-06-15'] }),
    }),
    '2026-06-22T00:00:00.000Z'
  );
  assert.equal(
    calculateNextRunAt({
      after: new Date('2026-06-14T23:30:00.000Z'),
      schedule: buildSchedule({ enabled: false }),
    }),
    null
  );
});
