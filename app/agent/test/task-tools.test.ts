/* eslint-disable max-lines -- Task tool tests keep related tool fixtures and assertions together. */
import type { PlainToolSet } from '#agent/assistant/plain-tool';
import { buildAssistantTaskTools } from '#agent/assistant/tools/task-tools';
import { createDraftRegistry, type DraftRegistry } from '#agent/draft-registry';
import type {
  CallAgenda,
  CallEvent,
  CallEventPayload,
  CallEventType,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-30T00:00:00.000Z';

const agenda: CallAgenda = {
  channelOpenWorkTasks: [],
  channelReviews: [],
  channels: [],
  followUpTasks: [],
  language: 'ja',
  now: NOW,
  purpose: 'scheduled_review',
  requestedWorkTasks: [],
  slackUserId: 'U_CALLER',
  timezone: 'Asia/Tokyo',
  workTasks: [],
};

type TaskComposition = Parameters<
  typeof buildAssistantTaskTools
>[0]['composition'];

const buildComposition = ({
  composeFollowUpTask = (): never => {
    assert.fail('Follow-up task should not be composed.');
  },
  composeWorkTaskPatch = (): never => {
    assert.fail('Work task patch should not be composed.');
  },
  composeWorkTaskTitle = (): never => {
    assert.fail('Work task title should not be composed.');
  },
  recordEvent = (): never => {
    assert.fail('No draft event should be recorded.');
  },
}: {
  readonly composeFollowUpTask?: (params: {
    readonly callSessionId: string;
    readonly hint: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) =>
    | Promise<{
        readonly followUpQuestion: string;
        readonly title: string;
      } | null>
    | never;
  readonly composeWorkTaskPatch?: (params: {
    readonly callSessionId: string;
    readonly changeSummary: string;
    readonly hint?: string;
    readonly speakerName?: string;
    readonly taskTitle: string;
    readonly titleHint?: string;
    readonly workspaceId: string;
  }) =>
    | Promise<{ readonly reason?: string; readonly title?: string } | null>
    | never;
  readonly composeWorkTaskTitle?: (params: {
    readonly callSessionId: string;
    readonly hint: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) => Promise<{ readonly title: string } | null> | never;
  readonly recordEvent?: (params: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly workspaceId: string;
  }) => Promise<CallEvent> | never;
} = {}): TaskComposition => ({
  services: {
    callSession: {
      recordEvent,
    },
    latestInfoComposer: {
      composeFromCallTranscript: (): never => {
        assert.fail('Latest info should not be composed.');
      },
    },
    proseComposer: {
      composeChannelReview: (): never => {
        assert.fail('Channel review should not be composed.');
      },
      composeFollowUpAnswer: (): never => {
        assert.fail('Follow-up answer should not be composed.');
      },
      composeFollowUpTask,
      composeWorkTaskPatch,
      composeWorkTaskTitle,
    },
  },
});

interface RecordedEvent {
  readonly payload: CallEventPayload;
  readonly type: CallEventType;
}

const createRecordEventSpy = (): {
  readonly recordEvent: (params: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly workspaceId: string;
  }) => Promise<CallEvent>;
  readonly recordedEvents: readonly RecordedEvent[];
} => {
  const recordedEvents: RecordedEvent[] = [];

  const recordEvent = ({
    callSessionId,
    payload,
    type,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly workspaceId: string;
  }): Promise<CallEvent> => {
    /* eslint-disable-next-line functional/immutable-data -- Test spy accumulates calls. */
    recordedEvents.push({ payload, type });

    return Promise.resolve({
      callSessionId,
      createdAt: NOW,
      id: 'event-1',
      payload,
      type,
      workspaceId,
    });
  };

  return { recordedEvents, recordEvent };
};

const buildTools = ({
  composition = buildComposition(),
  registry = createDraftRegistry(),
  toolAgenda = agenda,
}: {
  readonly composition?: TaskComposition;
  readonly registry?: DraftRegistry;
  readonly toolAgenda?: CallAgenda;
} = {}): PlainToolSet =>
  buildAssistantTaskTools({
    agenda: toolAgenda,
    composition,
    registry,
    room: {},
    sessionId: 'call-1',
    topic: 'call-data',
    workspaceId: 'T_WORKSPACE',
  });

const projectChannel: CallAgenda['channels'][number] = {
  assigneeSlackUserIds: ['U_OWNER'],
  channelId: 'C_PROJECT',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBySlackUserId: 'U_CREATOR',
  name: 'project-alpha',
  status: 'active',
  updatedAt: '2026-06-01T00:00:00.000Z',
  watcherSlackUserIds: ['U_WATCHER'],
  workspaceId: 'T_WORKSPACE',
};

void test('follow-up task tool rejects missing assignees', async () => {
  const registry = createDraftRegistry();
  const tools = buildTools({ registry });

  const result = await tools['propose_follow_up_task']?.execute({
    hint: 'confirm release date',
  });

  assert.match(String(result), /assigneeSlackUserIds was missing or empty/u);
  assert.deepEqual(registry.listOpen(), []);
});

void test('follow-up task tool rejects empty assignees', async () => {
  const registry = createDraftRegistry();
  const tools = buildTools({ registry });

  const result = await tools['propose_follow_up_task']?.execute({
    assigneeSlackUserIds: [],
    hint: 'confirm release date',
  });

  assert.match(String(result), /Do not pass \[\] to mean "unspecified"/u);
  assert.deepEqual(registry.listOpen(), []);
});

void test('follow-up task tool records a draft with the composed title and question', async () => {
  const { recordedEvents, recordEvent } = createRecordEventSpy();
  const composition = buildComposition({
    composeFollowUpTask: ({ callSessionId, hint, workspaceId }) => {
      assert.equal(callSessionId, 'call-1');
      assert.equal(hint, 'confirm release date');
      assert.equal(workspaceId, 'T_WORKSPACE');

      return Promise.resolve({
        followUpQuestion: 'Can you confirm the release date?',
        title: 'Confirm release date',
      });
    },
    recordEvent,
  });
  const registry = createDraftRegistry();
  const tools = buildTools({ composition, registry });

  const result = await tools['propose_follow_up_task']?.execute({
    assigneeSlackUserIds: ['U_TARGET'],
    hint: 'confirm release date',
  });

  assert.match(String(result), /Confirm release date/u);
  assert.match(String(result), /draft d1/u);

  assert.equal(recordedEvents.length, 1);
  const event = recordedEvents.at(0);
  assert.ok(event !== undefined);
  assert.equal(event.type, 'follow_up_task_draft_proposed');
  assert.deepEqual(event.payload, {
    drafts: [
      {
        assigneeSlackUserIds: ['U_TARGET'],
        draftId: 'd1',
        followUpQuestion: 'Can you confirm the release date?',
        requesterSlackUserIds: ['U_CALLER'],
        title: 'Confirm release date',
      },
    ],
  });

  assert.equal(registry.get('d1')?.status, 'pending');
});

void test('work task tool rejects empty assignees', async () => {
  const registry = createDraftRegistry();
  const tools = buildTools({ registry });

  const result = await tools['propose_work_task']?.execute({
    assigneeSlackUserIds: [],
    hint: 'launch checklist',
  });

  assert.match(String(result), /Work task draft was not recorded/u);
  assert.match(String(result), /Do not pass \[\] to mean "unspecified"/u);
  assert.deepEqual(registry.listOpen(), []);
});

void test('work task tool records a channel-scoped draft', async () => {
  const toolAgenda: CallAgenda = {
    ...agenda,
    channelOpenWorkTasks: [{ channel: projectChannel, openWorkTasks: [] }],
    channels: [projectChannel],
  };
  const { recordedEvents, recordEvent } = createRecordEventSpy();
  const composition = buildComposition({
    composeWorkTaskTitle: ({ callSessionId, hint, workspaceId }) => {
      assert.equal(callSessionId, 'call-1');
      assert.equal(hint, 'launch checklist');
      assert.equal(workspaceId, 'T_WORKSPACE');

      return Promise.resolve({ title: 'Prepare launch checklist' });
    },
    recordEvent,
  });
  const registry = createDraftRegistry();
  const tools = buildTools({ composition, registry, toolAgenda });

  const result = await tools['propose_work_task']?.execute({
    assigneeSlackUserIds: ['U_OWNER'],
    channelName: '#project-alpha',
    hint: 'launch checklist',
  });

  assert.match(String(result), /Prepare launch checklist/u);
  assert.match(String(result), /draft d1/u);

  assert.equal(recordedEvents.length, 1);
  const event = recordedEvents.at(0);
  assert.ok(event !== undefined);
  assert.equal(event.type, 'work_task_draft_proposed');
  assert.deepEqual(event.payload, {
    workTaskDrafts: [
      {
        assigneeSlackUserIds: ['U_OWNER'],
        channelId: 'C_PROJECT',
        draftId: 'd1',
        requesterSlackUserIds: ['U_CALLER'],
        title: 'Prepare launch checklist',
      },
    ],
  });

  assert.equal(registry.get('d1')?.status, 'pending');
});

void test('work task tool reports when the title could not be composed', async () => {
  const composition = buildComposition({
    composeWorkTaskTitle: () => Promise.resolve(null),
  });
  const registry = createDraftRegistry();
  const tools = buildTools({ composition, registry });

  const result = await tools['propose_work_task']?.execute({
    assigneeSlackUserIds: ['U_OWNER'],
    hint: 'launch checklist',
  });

  assert.match(String(result), /could not be composed from the conversation/u);
  assert.equal(registry.get('d1')?.status, 'failed');
});

void test('channel participants tool returns channel owners and task participants', async () => {
  const toolAgenda: CallAgenda = {
    ...agenda,
    channelOpenWorkTasks: [
      {
        channel: projectChannel,
        openWorkTasks: [
          {
            assigneeSlackUserIds: ['U_TASK_OWNER'],
            channelId: 'C_PROJECT',
            completedAt: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            dependentTaskIds: [],
            dependsOnTaskIds: [],
            id: 'task-1',
            kind: 'work',
            requesterSlackUserIds: ['U_REQUESTER'],
            status: 'active',
            title: 'Ship feature',
            updatedAt: '2026-06-01T00:00:00.000Z',
            workspaceId: 'T_WORKSPACE',
          },
        ],
      },
    ],
    channels: [projectChannel],
  };
  const tools = buildTools({ toolAgenda });

  const result = await tools['get_channel_participants']?.execute({
    channelName: 'project-alpha',
  });

  assert.deepEqual(JSON.parse(String(result)), {
    channel: {
      channelId: 'C_PROJECT',
      name: 'project-alpha',
    },
    creatorSlackUserId: 'U_CREATOR',
    ownerSlackUserIds: ['U_OWNER'],
    taskParticipantSlackUserIds: ['U_TASK_OWNER', 'U_REQUESTER'],
    watcherSlackUserIds: ['U_WATCHER'],
  });
});

void test('unrelated work task lookup excludes tasks involving the current user', async () => {
  const toolAgenda: CallAgenda = {
    ...agenda,
    channelOpenWorkTasks: [
      {
        channel: projectChannel,
        openWorkTasks: [
          {
            assigneeSlackUserIds: ['U_OTHER'],
            channelId: 'C_PROJECT',
            completedAt: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            dependentTaskIds: [],
            dependsOnTaskIds: [],
            id: 'task-unrelated',
            kind: 'work',
            requesterSlackUserIds: ['U_REQUESTER'],
            status: 'active',
            title: 'Ship unrelated feature',
            updatedAt: '2026-06-01T00:00:00.000Z',
            workspaceId: 'T_WORKSPACE',
          },
          {
            assigneeSlackUserIds: ['U_CALLER'],
            channelId: 'C_PROJECT',
            completedAt: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            dependentTaskIds: [],
            dependsOnTaskIds: [],
            id: 'task-assigned-to-caller',
            kind: 'work',
            requesterSlackUserIds: ['U_REQUESTER'],
            status: 'active',
            title: 'Caller owns this',
            updatedAt: '2026-06-01T00:00:00.000Z',
            workspaceId: 'T_WORKSPACE',
          },
          {
            assigneeSlackUserIds: ['U_OTHER'],
            channelId: 'C_PROJECT',
            completedAt: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            dependentTaskIds: [],
            dependsOnTaskIds: [],
            id: 'task-requested-by-caller',
            kind: 'work',
            requesterSlackUserIds: ['U_CALLER'],
            status: 'active',
            title: 'Caller requested this',
            updatedAt: '2026-06-01T00:00:00.000Z',
            workspaceId: 'T_WORKSPACE',
          },
        ],
      },
    ],
    channels: [projectChannel],
  };
  const tools = buildTools({ toolAgenda });

  const result = await tools['get_unrelated_open_work_tasks']?.execute({
    channelName: 'project-alpha',
  });

  assert.deepEqual(JSON.parse(String(result)), [
    {
      assigneeSlackUserIds: ['U_OTHER'],
      channelId: 'C_PROJECT',
      createdAt: '2026-06-01T00:00:00.000Z',
      requesterSlackUserIds: ['U_REQUESTER'],
      status: 'active',
      taskId: 'task-unrelated',
      title: 'Ship unrelated feature',
    },
  ]);
});

void test('work task patch tool records due-date removal as dueAt null', async () => {
  const toolAgenda: CallAgenda = {
    ...agenda,
    workTasks: [
      {
        assigneeSlackUserIds: ['U_CALLER'],
        completedAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        dependentTaskIds: [],
        dependsOnTaskIds: [],
        dueAt: '2026-07-10T00:00:00.000Z',
        id: 'task_1',
        kind: 'work',
        requesterSlackUserIds: ['U_CALLER'],
        status: 'active',
        title: 'Spec review',
        updatedAt: '2026-06-01T00:00:00.000Z',
        workspaceId: 'T_WORKSPACE',
      },
    ],
  };
  const { recordedEvents, recordEvent } = createRecordEventSpy();
  const composition = buildComposition({
    composeWorkTaskPatch: ({ changeSummary }) => {
      assert.match(changeSummary, /dueAt → none/u);

      return Promise.resolve({ reason: '期限を撤廃するため' });
    },
    recordEvent,
  });
  const tools = buildTools({ composition, toolAgenda });

  const result = await tools['propose_work_task_patch']?.execute({
    dueAt: 'none',
    reasonHint: 'no longer time-bound',
    taskId: 'task_1',
  });

  assert.match(String(result), /dueAt → none/u);

  assert.equal(recordedEvents.length, 1);
  const event = recordedEvents.at(0);
  assert.ok(event !== undefined);
  assert.equal(event.type, 'task_patch_proposed');
  assert.ok('patches' in event.payload);

  const patch = event.payload.patches.at(0);

  assert.ok(patch !== undefined);
  assert.ok(patch.after.kind === 'work');
  assert.equal(patch.after.dueAt, null);
});
