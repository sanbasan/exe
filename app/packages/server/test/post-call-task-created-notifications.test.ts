import { sendTasksCreatedFromCall } from '../src/infrastructure/notifications/task-created-from-call';
import type {
  NotificationGateway,
  SlackGateway,
  TaskCreatedFromCallMessageReference,
  WorkspaceRepository,
} from '../src/ports';
import type {
  CallWorkflowDeps,
  WorkflowErrorReport,
} from '../src/workflows/deps';
import { notifyTasksCreatedFromCallBestEffort } from '../src/workflows/post-call-task-created-notifications';
import {
  callSessionSchema,
  followUpTaskSchema,
  userProfileSchema,
  workTaskSchema,
  workspaceSchema,
  type Task,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T12:00:00.000Z';
const CALL_START = '2026-07-01T11:00:00.000Z';
const WORKSPACE_ID = 'T123';
const USER_ID = 'user-1';
const SESSION_SLACK_USER_ID = 'U_SESSION';

const workspace = workspaceSchema.parse({
  admin: { emails: [], slackUserIds: [] },
  botUserId: 'U_BOT',
  createdAt: '2026-06-01T00:00:00.000Z',
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: '2026-06-01T00:00:00.000Z',
});

const userProfile = userProfileSchema.parse({
  createdAt: '2026-06-01T00:00:00.000Z',
  email: 'user@example.com',
  id: USER_ID,
  slackUsers: [
    {
      slackTeamId: WORKSPACE_ID,
      slackUserId: SESSION_SLACK_USER_ID,
      verifiedAt: '2026-06-01T00:00:00.000Z',
      workspaceId: WORKSPACE_ID,
    },
  ],
  updatedAt: '2026-06-01T00:00:00.000Z',
  workspaceIds: [WORKSPACE_ID],
});

const session = callSessionSchema.parse({
  createdAt: '2026-07-01T10:55:00.000Z',
  id: 'call-1',
  liveKitRoomName: 'room-1',
  purpose: 'scheduled_review',
  startedAt: CALL_START,
  status: 'ended',
  updatedAt: NOW,
  userId: USER_ID,
  workspaceId: WORKSPACE_ID,
});

const buildWorkTask = (overrides: Partial<Task> = {}): Task =>
  workTaskSchema.parse({
    assigneeSlackUserIds: ['UASSIGNEE'],
    channelId: 'C123',
    completedAt: null,
    createdAt: NOW,
    dueAt: '2026-07-03T09:00:00.000Z',
    id: 'task-1',
    kind: 'work',
    requesterSlackUserIds: [SESSION_SLACK_USER_ID],
    status: 'active',
    title: '議事録を共有する',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const buildWorkTaskWithoutChannel = (overrides: Partial<Task> = {}): Task =>
  workTaskSchema.parse({
    assigneeSlackUserIds: ['UASSIGNEE'],
    completedAt: null,
    createdAt: NOW,
    dueAt: '2026-07-03T09:00:00.000Z',
    id: 'task-without-channel',
    kind: 'work',
    requesterSlackUserIds: [SESSION_SLACK_USER_ID],
    status: 'active',
    title: 'チャンネルなしのタスク',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const buildFollowUpTask = (overrides: Partial<Task> = {}): Task =>
  followUpTaskSchema.parse({
    assigneeSlackUserIds: ['UASSIGNEE2'],
    channelId: 'C123',
    completedAt: null,
    createdAt: NOW,
    followUpQuestion: '次回確認することは？',
    id: 'task-2',
    kind: 'follow_up',
    requesterSlackUserIds: [SESSION_SLACK_USER_ID],
    status: 'active',
    title: '次回確認事項を整理する',
    updatedAt: NOW,
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

class RecordingNotificationGateway {
  public calls: {
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly tasks: readonly Task[];
    readonly workspace: Workspace;
  }[] = [];

  private readonly result: (call: {
    readonly channelId: string;
    readonly tasks: readonly Task[];
  }) => Promise<readonly TaskCreatedFromCallMessageReference[]>;

  public constructor(
    result?: (call: {
      readonly channelId: string;
      readonly tasks: readonly Task[];
    }) => Promise<readonly TaskCreatedFromCallMessageReference[]>
  ) {
    this.result =
      result ??
      (async (call) => {
        const rootNumber = 4000 + this.calls.length;
        const threadTs = `${rootNumber}.000000`;

        return call.tasks.map((task, index) => ({
          channelId: call.channelId,
          messageTs: `${rootNumber}.${String(index + 1).padStart(6, '0')}`,
          taskId: task.id,
          threadTs,
        }));
      });
  }

  public sendTasksCreatedFromCall = (call: {
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly tasks: readonly Task[];
    readonly workspace: Workspace;
  }): Promise<readonly TaskCreatedFromCallMessageReference[]> => {
    this.calls = [...this.calls, call];

    return this.result(call);
  };
}

const buildDeps = ({
  notificationGateway,
  onReport = (): void => {},
  onTaskUpdate = (): void => {},
}: {
  readonly notificationGateway: RecordingNotificationGateway;
  readonly onReport?: (report: WorkflowErrorReport) => void;
  readonly onTaskUpdate?: (task: Task) => void;
}): CallWorkflowDeps =>
  ({
    clock: { now: () => NOW },
    errorReporter: {
      report: async (report: WorkflowErrorReport): Promise<void> => {
        onReport(report);
      },
    },
    notificationGateway: notificationGateway as unknown as NotificationGateway,
    taskRepository: {
      update: async ({ task }: { readonly task: Task }): Promise<void> => {
        onTaskUpdate(task);
      },
    },
    userProfileRepository: {
      getById: async (): Promise<UserProfile> => userProfile,
    },
    workspaceRepository: {
      getById: async (): Promise<Workspace> => workspace,
    },
  }) as unknown as CallWorkflowDeps;

const workspaceRepository: WorkspaceRepository = {
  acquireTokenRefreshLock: async () => true,
  getById: async (): Promise<Workspace> => workspace,
  listAll: async () => [workspace],
  listByIds: async () => [workspace],
  releaseTokenRefreshLock: async () => {},
  updateTokens: async () => {},
  upsert: async () => {},
};

class RecordingSlackGateway {
  public messages: Parameters<SlackGateway['postMessage']>[0][] = [];

  public getUserInfo = async ({
    slackUserId,
  }: {
    readonly botToken: string;
    readonly slackUserId: string;
  }) => ({
    status: 'ok' as const,
    user: {
      displayName: slackUserId,
      email: `${slackUserId}@example.com`,
      realName: slackUserId,
      slackUserId,
    },
  });

  public postMessage = async (
    message: Parameters<SlackGateway['postMessage']>[0]
  ): Promise<string> => {
    this.messages = [...this.messages, message];

    return `5000.${String(this.messages.length).padStart(6, '0')}`;
  };
}

const getFirstBlockText = (
  message: Parameters<SlackGateway['postMessage']>[0]
): string => {
  const [block] = message.blocks;
  const record = block as {
    readonly text?: { readonly text: string };
  };

  return record.text?.text ?? '';
};

void test('tasks created from a call are grouped by channel and save threaded card ts', async () => {
  const notificationGateway = new RecordingNotificationGateway();
  const updatedTasks: Task[] = [];
  const firstTask = buildWorkTask();
  const secondTask = buildFollowUpTask();
  const thirdTask = buildWorkTask({
    channelId: 'C999',
    id: 'task-3',
    title: '別チャンネルのタスク',
  });

  await notifyTasksCreatedFromCallBestEffort({
    deps: buildDeps({
      notificationGateway,
      onTaskUpdate: (updatedTask) => updatedTasks.push(updatedTask),
    }),
    session,
    tasks: [firstTask, secondTask, thirdTask, buildWorkTaskWithoutChannel()],
  });

  assert.equal(notificationGateway.calls.length, 2);
  assert.deepEqual(
    notificationGateway.calls.map((call) => call.channelId),
    ['C123', 'C999']
  );
  assert.deepEqual(
    notificationGateway.calls[0].tasks.map((task) => task.id),
    ['task-1', 'task-2']
  );
  assert.deepEqual(
    notificationGateway.calls[1].tasks.map((task) => task.id),
    ['task-3']
  );
  assert.equal(notificationGateway.calls[0].sessionStartedAt, CALL_START);
  assert.equal(
    notificationGateway.calls[0].speakerSlackUserId,
    SESSION_SLACK_USER_ID
  );

  assert.equal(updatedTasks.length, 3);
  assert.deepEqual(
    updatedTasks.map((task) => ({
      id: task.id,
      messageTs: task.messageTs,
      threadTs: task.threadTs,
      updatedAt: task.updatedAt,
    })),
    [
      {
        id: 'task-1',
        messageTs: '4001.000001',
        threadTs: '4001.000000',
        updatedAt: NOW,
      },
      {
        id: 'task-2',
        messageTs: '4001.000002',
        threadTs: '4001.000000',
        updatedAt: NOW,
      },
      {
        id: 'task-3',
        messageTs: '4002.000001',
        threadTs: '4002.000000',
        updatedAt: NOW,
      },
    ]
  );
});

void test('tasks without a channel skip the channel notification', async () => {
  const notificationGateway = new RecordingNotificationGateway();
  const updatedTasks: Task[] = [];

  await notifyTasksCreatedFromCallBestEffort({
    deps: buildDeps({
      notificationGateway,
      onTaskUpdate: (updatedTask) => updatedTasks.push(updatedTask),
    }),
    session,
    tasks: [buildWorkTaskWithoutChannel()],
  });

  assert.equal(notificationGateway.calls.length, 0);
  assert.equal(updatedTasks.length, 0);
});

void test('a failed channel notification is reported and does not throw', async () => {
  const notificationGateway = new RecordingNotificationGateway(async () => {
    throw new Error('slack down');
  });
  const reports: WorkflowErrorReport[] = [];

  await notifyTasksCreatedFromCallBestEffort({
    deps: buildDeps({
      notificationGateway,
      onReport: (report) => reports.push(report),
    }),
    session,
    tasks: [buildWorkTask()],
  });

  assert.equal(reports.length, 1);
  assert.equal(
    reports[0].context.route,
    'workflows/finalizeEndedCalls/task-created-notification'
  );
  assert.match(String(reports[0].error), /channelId=C123/u);
  assert.match(String(reports[0].error), /taskIds=task-1/u);
  assert.match(String(reports[0].error), /slack down/u);
});

void test('sendTasksCreatedFromCall posts one root message and task cards in its thread', async () => {
  const slackGateway = new RecordingSlackGateway();
  const firstTask = buildWorkTask();
  const secondTask = buildFollowUpTask();

  const messages = await sendTasksCreatedFromCall({
    channelId: 'C123',
    deps: {
      clock: { now: () => NOW },
      slackGateway: slackGateway as unknown as SlackGateway,
      workspaceRepository,
    },
    sessionStartedAt: CALL_START,
    speakerSlackUserId: SESSION_SLACK_USER_ID,
    tasks: [firstTask, secondTask],
    workspace,
  });

  assert.deepEqual(messages, [
    {
      channelId: 'C123',
      messageTs: '5000.000002',
      taskId: 'task-1',
      threadTs: '5000.000001',
    },
    {
      channelId: 'C123',
      messageTs: '5000.000003',
      taskId: 'task-2',
      threadTs: '5000.000001',
    },
  ]);

  assert.equal(slackGateway.messages.length, 3);
  assert.equal(slackGateway.messages[0].channelId, 'C123');
  assert.equal(slackGateway.messages[0].threadTs, undefined);
  assert.equal(
    slackGateway.messages[0].text,
    '07/01 (水) 20:00 の <@U_SESSION> さんとの通話セッションでタスクが2件追加されました。'
  );
  assert.equal(
    getFirstBlockText(slackGateway.messages[0]),
    ':memo: 07/01 (水) 20:00 の <@U_SESSION> さんとの通話セッションでタスクが2件追加されました。'
  );

  assert.equal(slackGateway.messages[1].threadTs, '5000.000001');
  assert.equal(slackGateway.messages[1].text, firstTask.title);
  assert.match(
    getFirstBlockText(slackGateway.messages[1]),
    /議事録を共有する/u
  );

  assert.equal(slackGateway.messages[2].threadTs, '5000.000001');
  assert.equal(slackGateway.messages[2].text, secondTask.title);
  assert.match(
    getFirstBlockText(slackGateway.messages[2]),
    /次回確認事項を整理する/u
  );
});
