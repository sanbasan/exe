import type {
  NotificationGateway,
  OverdueTaskNotificationRepository,
  SlackGateway,
  SlackUserLookup,
  WorkspaceRepository,
} from '../src/ports';
import type {
  CallWorkflowDeps,
  WorkflowErrorReport,
  WorkflowErrorReporter,
} from '../src/workflows/deps';
import { notifyPatchApplied } from '../src/workflows/post-call-task-patch-notifications';
import {
  callSessionSchema,
  overdueTaskNotificationSchema,
  workTaskSchema,
  workspaceSchema,
  type Task,
  type TaskPatch,
  type Workspace,
} from '@exe/domain';
import type { KnownBlock } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const TASK_ID = 'task-1';

const workspace = workspaceSchema.parse({
  admin: { emails: [], slackUserIds: [] },
  botUserId: 'UBOT',
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
});

const session = callSessionSchema.parse({
  createdAt: NOW,
  id: 'call-1',
  liveKitRoomName: 'room-1',
  purpose: 'scheduled_review',
  status: 'ended',
  updatedAt: NOW,
  userId: 'user-1',
  workspaceId: WORKSPACE_ID,
});

const previousTask = workTaskSchema.parse({
  assigneeSlackUserIds: ['UASSIGNEE'],
  channelId: 'C123',
  completedAt: null,
  createdAt: NOW,
  dueAt: '2026-06-29T14:59:00.000Z',
  id: TASK_ID,
  kind: 'work',
  messageTs: '1000.000',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'active',
  threadTs: '1000.000',
  title: 'Submit report',
  updatedAt: NOW,
  workspaceId: WORKSPACE_ID,
});

const updatedTask = workTaskSchema.parse({
  ...previousTask,
  dueAt: '2026-07-01T14:59:00.000Z',
  updatedAt: '2026-06-30T00:01:00.000Z',
});

// Same due date, only the title changed. Still has a posted card.
const titleOnlyTask = workTaskSchema.parse({
  ...previousTask,
  title: 'Submit revised report',
  updatedAt: '2026-06-30T00:01:00.000Z',
});

// No posted card (no channelId / messageTs) and completed status, so neither a
// card refresh nor a due-date thread notice applies.
const cardlessPreviousTask = workTaskSchema.parse({
  assigneeSlackUserIds: ['UASSIGNEE'],
  completedAt: null,
  createdAt: NOW,
  dueAt: '2026-06-29T14:59:00.000Z',
  id: TASK_ID,
  kind: 'work',
  requesterSlackUserIds: ['UREQUESTER'],
  status: 'active',
  title: 'Submit report',
  updatedAt: NOW,
  workspaceId: WORKSPACE_ID,
});

const cardlessCompletedTask = workTaskSchema.parse({
  ...cardlessPreviousTask,
  completedAt: '2026-06-30T00:01:00.000Z',
  status: 'completed',
  updatedAt: '2026-06-30T00:01:00.000Z',
});

const patch: TaskPatch = {
  after: {
    dueAt: '2026-07-01T14:59:00.000Z',
    kind: 'work',
  },
  before: {
    dueAt: '2026-06-29T14:59:00.000Z',
    kind: 'work',
  },
  reason: '先方確認が翌日にずれたため',
  taskId: TASK_ID,
};

const overdueNotification = overdueTaskNotificationSchema.parse({
  createdAt: '2026-06-29T15:30:00.000Z',
  id: 'overdue-1',
  slack: {
    channelId: 'C123',
    messageTs: '2000.000',
    threadTs: '1000.000',
  },
  taskId: TASK_ID,
  updatedAt: '2026-06-29T15:30:00.000Z',
  workspaceId: WORKSPACE_ID,
});

const workspaceRepository: WorkspaceRepository = {
  acquireTokenRefreshLock: async () => true,
  getById: async (): Promise<Workspace> => workspace,
  listAll: async () => [workspace],
  listByIds: async () => [workspace],
  releaseTokenRefreshLock: async () => {},
  updateTokens: async () => {},
  upsert: async () => {},
};

class RecordingOverdueTaskNotificationRepository implements OverdueTaskNotificationRepository {
  public deletedTaskIds: readonly string[] = [];

  public create = async (): Promise<void> => {};

  public deleteByTask = async ({
    taskId,
  }: {
    readonly taskId: string;
    readonly workspaceId: string;
  }): Promise<void> => {
    this.deletedTaskIds = [...this.deletedTaskIds, taskId];
  };

  public listByTask = async () => [overdueNotification];
}

class RecordingSlackGateway {
  public deletedMessages: {
    readonly channelId: string;
    readonly messageTs: string;
  }[] = [];

  public updatedMessages: {
    readonly channelId: string;
    readonly messageTs: string;
    readonly text: string;
  }[] = [];

  public updateMessageError: Error | null = null;

  public deleteMessage = async ({
    channelId,
    messageTs,
  }: {
    readonly botToken: string;
    readonly channelId: string;
    readonly messageTs: string;
  }): Promise<void> => {
    this.deletedMessages = [...this.deletedMessages, { channelId, messageTs }];
  };

  public getUserInfo = async (): Promise<SlackUserLookup> => ({
    status: 'indeterminate',
  });

  public updateMessage = async ({
    channelId,
    messageTs,
    text,
  }: {
    readonly blocks: readonly KnownBlock[];
    readonly botToken: string;
    readonly channelId: string;
    readonly messageTs: string;
    readonly text: string;
  }): Promise<void> => {
    this.updatedMessages = [
      ...this.updatedMessages,
      { channelId, messageTs, text },
    ];

    if (this.updateMessageError !== null) {
      throw this.updateMessageError;
    }
  };
}

class RecordingErrorReporter implements WorkflowErrorReporter {
  public reports: WorkflowErrorReport[] = [];

  public report = async ({
    context,
    error,
  }: WorkflowErrorReport): Promise<void> => {
    this.reports = [...this.reports, { context, error }];
  };
}

class RecordingNotificationGateway {
  public notices: {
    readonly patch: TaskPatch;
    readonly previousTask: Task;
    readonly task: Task;
  }[] = [];

  public sendTaskPatchThreadNotice = async ({
    patch,
    previousTask,
    task,
  }: {
    readonly patch: TaskPatch;
    readonly previousTask: Task;
    readonly task: Task;
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.notices = [...this.notices, { patch, previousTask, task }];
  };
}

const buildDeps = ({
  errorReporter,
  notificationGateway,
  overdueTaskNotificationRepository,
  slackGateway,
}: {
  readonly errorReporter: RecordingErrorReporter;
  readonly notificationGateway: RecordingNotificationGateway;
  readonly overdueTaskNotificationRepository: RecordingOverdueTaskNotificationRepository;
  readonly slackGateway: RecordingSlackGateway;
}): CallWorkflowDeps =>
  ({
    clock: { now: () => NOW },
    errorReporter,
    notificationGateway: notificationGateway as unknown as NotificationGateway,
    overdueTaskNotificationRepository,
    slackGateway: slackGateway as unknown as SlackGateway,
    workspaceRepository,
  }) as unknown as CallWorkflowDeps;

void test('due-date patches from scheduled reviews rewrite the card, post a reason, and delete overdue notifications', async () => {
  const errorReporter = new RecordingErrorReporter();
  const notificationGateway = new RecordingNotificationGateway();
  const overdueTaskNotificationRepository =
    new RecordingOverdueTaskNotificationRepository();
  const slackGateway = new RecordingSlackGateway();

  await notifyPatchApplied({
    deps: buildDeps({
      errorReporter,
      notificationGateway,
      overdueTaskNotificationRepository,
      slackGateway,
    }),
    patch,
    previousTask,
    session,
    task: updatedTask,
  });

  assert.deepEqual(slackGateway.updatedMessages, [
    {
      channelId: 'C123',
      messageTs: '1000.000',
      text: updatedTask.title,
    },
  ]);
  assert.equal(notificationGateway.notices.length, 1);
  assert.equal(notificationGateway.notices[0].patch.reason, patch.reason);
  assert.equal(notificationGateway.notices[0].previousTask.id, TASK_ID);
  assert.equal(notificationGateway.notices[0].task.id, TASK_ID);
  assert.deepEqual(slackGateway.deletedMessages, [
    {
      channelId: 'C123',
      messageTs: '2000.000',
    },
  ]);
  assert.deepEqual(overdueTaskNotificationRepository.deletedTaskIds, [TASK_ID]);
  assert.equal(errorReporter.reports.length, 0);
});

void test('title-only patches rewrite the posted card without a due-date thread notice', async () => {
  const errorReporter = new RecordingErrorReporter();
  const notificationGateway = new RecordingNotificationGateway();
  const overdueTaskNotificationRepository =
    new RecordingOverdueTaskNotificationRepository();
  const slackGateway = new RecordingSlackGateway();

  await notifyPatchApplied({
    deps: buildDeps({
      errorReporter,
      notificationGateway,
      overdueTaskNotificationRepository,
      slackGateway,
    }),
    patch,
    previousTask,
    session,
    task: titleOnlyTask,
  });

  assert.deepEqual(slackGateway.updatedMessages, [
    {
      channelId: 'C123',
      messageTs: '1000.000',
      text: titleOnlyTask.title,
    },
  ]);
  assert.equal(notificationGateway.notices.length, 0);
  assert.deepEqual(slackGateway.deletedMessages, []);
  assert.deepEqual(overdueTaskNotificationRepository.deletedTaskIds, []);
  assert.equal(errorReporter.reports.length, 0);
});

void test('patches on cardless tasks with an unchanged due date send no card update or thread notice', async () => {
  const errorReporter = new RecordingErrorReporter();
  const notificationGateway = new RecordingNotificationGateway();
  const overdueTaskNotificationRepository =
    new RecordingOverdueTaskNotificationRepository();
  const slackGateway = new RecordingSlackGateway();

  await notifyPatchApplied({
    deps: buildDeps({
      errorReporter,
      notificationGateway,
      overdueTaskNotificationRepository,
      slackGateway,
    }),
    patch,
    previousTask: cardlessPreviousTask,
    session,
    task: cardlessCompletedTask,
  });

  assert.deepEqual(slackGateway.updatedMessages, []);
  assert.equal(notificationGateway.notices.length, 0);
  assert.equal(errorReporter.reports.length, 0);
});

void test('a Slack failure while rewriting the card is reported but does not abort finalization', async () => {
  const errorReporter = new RecordingErrorReporter();
  const notificationGateway = new RecordingNotificationGateway();
  const overdueTaskNotificationRepository =
    new RecordingOverdueTaskNotificationRepository();
  const slackGateway = new RecordingSlackGateway();
  slackGateway.updateMessageError = new Error('slack update failed');

  await notifyPatchApplied({
    deps: buildDeps({
      errorReporter,
      notificationGateway,
      overdueTaskNotificationRepository,
      slackGateway,
    }),
    patch,
    previousTask,
    session,
    task: updatedTask,
  });

  assert.equal(errorReporter.reports.length, 1);
  assert.deepEqual(errorReporter.reports[0].context, {
    route: 'workflows/finalizeEndedCalls/task-card',
  });
  // The card failure is swallowed; the thread notice and overdue cleanup still run.
  assert.equal(notificationGateway.notices.length, 1);
  assert.deepEqual(overdueTaskNotificationRepository.deletedTaskIds, [TASK_ID]);
});
