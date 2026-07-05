import type { ChannelRepository, Clock } from '../src/ports';
import {
  syncChannelAssigneesForTask,
  syncChannelAssigneesForTaskBestEffort,
} from '../src/services/channel-assignee-sync';
import type { Channel, WorkTask } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';
const EARLIER = '2026-06-26T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const CHANNEL_ID = 'C1';
const ASSIGNEE_USER = 'UASSIGNEE';
const REQUESTER_USER = 'UREQUESTER';
const EXISTING_OWNER = 'UOWNER';

const clock: Clock = { now: () => NOW };

class InMemoryChannelRepository implements ChannelRepository {
  public channels: Channel[];
  public getByIdCalls = 0;
  public upsertCalls = 0;

  public constructor(channels: readonly Channel[]) {
    this.channels = [...channels];
  }

  public getById = async ({
    channelId,
  }: {
    readonly channelId: string;
    readonly workspaceId: string;
  }): Promise<Channel | null> => {
    this.getByIdCalls += 1;

    return (
      this.channels.find((channel) => channel.channelId === channelId) ?? null
    );
  };

  public listByWorkspace = async (): Promise<readonly Channel[]> => [
    ...this.channels,
  ];

  public upsert = async ({
    channel,
  }: {
    readonly channel: Channel;
  }): Promise<void> => {
    this.upsertCalls += 1;

    const index = this.channels.findIndex(
      (existing) => existing.channelId === channel.channelId
    );

    if (index === -1) {
      this.channels = [...this.channels, channel];
      return;
    }

    this.channels = this.channels.with(index, channel);
  };
}

const buildChannel = (overrides: Partial<Channel> = {}): Channel => ({
  assigneeSlackUserIds: [EXISTING_OWNER],
  channelId: CHANNEL_ID,
  createdAt: EARLIER,
  createdBySlackUserId: 'UCREATOR',
  name: 'general',
  status: 'active',
  updatedAt: EARLIER,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const buildTask = (overrides: Partial<WorkTask> = {}): WorkTask => ({
  assigneeSlackUserIds: [ASSIGNEE_USER],
  channelId: CHANNEL_ID,
  completedAt: null,
  createdAt: EARLIER,
  id: 'task-1',
  kind: 'work',
  requesterSlackUserIds: [REQUESTER_USER],
  status: 'active',
  title: 'Do the thing',
  updatedAt: EARLIER,
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

test('new task adds missing participants to channel assignees, preserving existing owners', async () => {
  const channelRepository = new InMemoryChannelRepository([buildChannel()]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    task: buildTask(),
  });

  assert.equal(channelRepository.upsertCalls, 1);
  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, [
    EXISTING_OWNER,
    ASSIGNEE_USER,
    REQUESTER_USER,
  ]);
  assert.equal(channelRepository.channels[0].updatedAt, NOW);
});

test('no upsert when every participant is already a channel assignee', async () => {
  const channel = buildChannel({
    assigneeSlackUserIds: [EXISTING_OWNER, ASSIGNEE_USER, REQUESTER_USER],
  });
  const channelRepository = new InMemoryChannelRepository([channel]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    task: buildTask(),
  });

  assert.equal(channelRepository.upsertCalls, 0);
  assert.deepEqual(channelRepository.channels[0], channel);
  assert.equal(channelRepository.channels[0].updatedAt, EARLIER);
});

test('no-op when task has no channel id (getById not called)', async () => {
  const channelRepository = new InMemoryChannelRepository([buildChannel()]);
  const before = channelRepository.channels;

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    task: buildTask({ channelId: undefined }),
  });

  assert.equal(channelRepository.getByIdCalls, 0);
  assert.equal(channelRepository.upsertCalls, 0);
  assert.equal(channelRepository.channels, before);
});

test('no-op and no throw when channel does not exist', async () => {
  const channelRepository = new InMemoryChannelRepository([]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    task: buildTask(),
  });

  assert.equal(channelRepository.getByIdCalls, 1);
  assert.equal(channelRepository.upsertCalls, 0);
  assert.deepEqual(channelRepository.channels, []);
});

test('no-op when channel is archived', async () => {
  const channelRepository = new InMemoryChannelRepository([
    buildChannel({ status: 'archived' }),
  ]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    task: buildTask(),
  });

  assert.equal(channelRepository.upsertCalls, 0);
  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, [
    EXISTING_OWNER,
  ]);
});

test('edit does not resurrect a removed owner but adds newly added participants', async () => {
  // Participant X was on the previous task and remains on the task, but an
  // owner explicitly removed them from the channel. Participant Y is newly
  // added to the task and must be added to the channel.
  const removedParticipant = 'UREMOVED';
  const newParticipant = 'UNEW';

  const channelRepository = new InMemoryChannelRepository([
    buildChannel({ assigneeSlackUserIds: [EXISTING_OWNER] }),
  ]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    previousTask: buildTask({
      assigneeSlackUserIds: [removedParticipant],
      requesterSlackUserIds: [],
    }),
    task: buildTask({
      assigneeSlackUserIds: [removedParticipant, newParticipant],
      requesterSlackUserIds: [],
    }),
  });

  assert.equal(channelRepository.upsertCalls, 1);
  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, [
    EXISTING_OWNER,
    newParticipant,
  ]);
});

test('changing the task channel treats all participants as new for the new channel', async () => {
  const newChannelId = 'C2';
  const channelRepository = new InMemoryChannelRepository([
    buildChannel({
      assigneeSlackUserIds: [EXISTING_OWNER],
      channelId: newChannelId,
    }),
  ]);

  await syncChannelAssigneesForTask({
    channelRepository,
    clock,
    previousTask: buildTask({ channelId: CHANNEL_ID }),
    task: buildTask({ channelId: newChannelId }),
  });

  assert.equal(channelRepository.upsertCalls, 1);
  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, [
    EXISTING_OWNER,
    ASSIGNEE_USER,
    REQUESTER_USER,
  ]);
});

test('best-effort variant resolves even when the repository rejects', async () => {
  const rejectingRepository: ChannelRepository = {
    getById: async () => {
      throw new Error('boom');
    },
    listByWorkspace: async () => [],
    upsert: async () => {},
  };

  await assert.doesNotReject(
    syncChannelAssigneesForTaskBestEffort({
      channelRepository: rejectingRepository,
      clock,
      task: buildTask(),
    })
  );
});
