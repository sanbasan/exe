import type {
  ChannelRepository,
  Clock,
  SlackChannelInfo,
  SlackGateway,
  WorkspaceRepository,
  WorkspaceTokenFields,
} from '../src/ports';
import {
  openSlackChannelOwnerEditor,
  saveSlackChannelOwnerEditor,
  updateSlackChannelOwnerEditor,
} from '../src/services/slack-channel-owner-editor';
import type { Channel, Workspace } from '@exe/domain';
import { slackActionIds, slackBlockIds, slackViewIds } from '@exe/slack';
import type { View } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';
const WORKSPACE_ID = 'T123';
const ADMIN_USER = 'UADMIN';
const EDITOR_USER = 'UEDITOR';
const ASSIGNEE_USER = 'UASSIGNEE';
const OTHER_USER = 'UOTHER';

class InMemoryChannelRepository implements ChannelRepository {
  public channels: Channel[];

  public constructor(channels: readonly Channel[]) {
    this.channels = [...channels];
  }

  public getById = async ({
    channelId,
  }: {
    readonly channelId: string;
    readonly workspaceId: string;
  }): Promise<Channel | null> =>
    this.channels.find((channel) => channel.channelId === channelId) ?? null;

  public listByWorkspace = async (): Promise<readonly Channel[]> => [
    ...this.channels,
  ];

  public upsert = async ({
    channel,
  }: {
    readonly channel: Channel;
  }): Promise<void> => {
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

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  public workspace: Workspace | null;

  public constructor(workspace: Workspace | null) {
    this.workspace = workspace;
  }

  public acquireTokenRefreshLock = async (): Promise<boolean> => true;

  public getById = async (): Promise<Workspace | null> => this.workspace;

  public listAll = async (): Promise<readonly Workspace[]> =>
    this.workspace === null ? [] : [this.workspace];

  public listByIds = async (): Promise<readonly Workspace[]> =>
    this.workspace === null ? [] : [this.workspace];

  public releaseTokenRefreshLock = async (): Promise<void> => {};

  public updateTokens = async ({
    tokens,
  }: {
    readonly tokens: WorkspaceTokenFields;
    readonly workspaceId: string;
  }): Promise<void> => {
    if (this.workspace !== null) {
      this.workspace = { ...this.workspace, ...tokens };
    }
  };

  public upsert = async ({
    workspace,
  }: {
    readonly workspace: Workspace;
  }): Promise<void> => {
    this.workspace = workspace;
  };
}

class RecordingSlackGateway {
  public botJoinedChannels: readonly SlackChannelInfo[] = [];
  public listBotJoinedChannelsError: Error | null = null;
  public openViews: { botToken: string; triggerId: string; view: View }[] = [];
  public updateViewError: Error | null = null;
  public updateViews: {
    botToken: string;
    hash?: string;
    view: View;
    viewId: string;
  }[] = [];

  public openView = async (params: {
    readonly botToken: string;
    readonly triggerId: string;
    readonly view: View;
  }): Promise<void> => {
    this.openViews = [...this.openViews, params];
  };

  public listBotJoinedChannels = async (): Promise<
    readonly SlackChannelInfo[]
  > => {
    if (this.listBotJoinedChannelsError !== null) {
      throw this.listBotJoinedChannelsError;
    }

    return this.botJoinedChannels;
  };

  public updateView = async (params: {
    readonly botToken: string;
    readonly hash?: string;
    readonly view: View;
    readonly viewId: string;
  }): Promise<void> => {
    this.updateViews = [...this.updateViews, params];

    if (this.updateViewError !== null) {
      throw this.updateViewError;
    }
  };
}

const clock: Clock = { now: () => NOW };

const buildWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  admin: { emails: ['admin@example.com'], slackUserIds: [ADMIN_USER] },
  botUserId: 'UBOT',
  channelOwnerEditors: { emails: [], slackUserIds: [] },
  createdAt: NOW,
  encryptedBotToken: 'bot-token',
  id: WORKSPACE_ID,
  language: 'ja',
  name: 'Test Workspace',
  slackTeamId: WORKSPACE_ID,
  timezone: 'Asia/Tokyo',
  updatedAt: NOW,
  ...overrides,
});

const buildChannel = (overrides: Partial<Channel>): Channel => ({
  assigneeSlackUserIds: [ASSIGNEE_USER],
  channelId: 'C1',
  createdAt: NOW,
  createdBySlackUserId: 'UCREATOR',
  name: 'general',
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: WORKSPACE_ID,
  ...overrides,
});

const slackApiError = (slackError: string): Error => {
  const error = new Error(slackError);

  Object.defineProperty(error, 'data', {
    value: { error: slackError },
  });

  return error;
};

const buildDeps = ({
  channels,
  workspace = buildWorkspace(),
}: {
  readonly channels: readonly Channel[];
  readonly workspace?: Workspace | null;
}) => {
  const channelRepository = new InMemoryChannelRepository(channels);
  const slackGateway = new RecordingSlackGateway();
  const workspaceRepository = new InMemoryWorkspaceRepository(workspace);

  return {
    channelRepository,
    deps: {
      channelRepository,
      clock,
      slackGateway: slackGateway as unknown as SlackGateway,
      workspaceRepository,
    },
    slackGateway,
    workspaceRepository,
  };
};

const selectedUsersState = (selectedUsers: readonly string[]): unknown => ({
  [slackBlockIds.channelOwnerEditorAssignees]: {
    [slackActionIds.channelOwnerEditorAssignees]: {
      selected_users: selectedUsers,
    },
  },
});

const getChannelSelectOptions = (view: View): readonly string[] => {
  const channelBlock = view.blocks.find(
    (block) =>
      block.type === 'input' &&
      block.block_id === slackBlockIds.channelOwnerEditorChannel
  );

  if (channelBlock?.type !== 'input') {
    return [];
  }

  return channelBlock.element.type === 'static_select'
    ? (channelBlock.element.options?.flatMap((option) =>
        option.value === undefined ? [] : [option.value]
      ) ?? [])
    : [];
};

test('open shows all active channels for channel-owner editors', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [
      buildChannel({ channelId: 'CASSIGNED', name: 'assigned' }),
      buildChannel({
        assigneeSlackUserIds: [OTHER_USER],
        channelId: 'COTHER',
        name: 'other',
      }),
      buildChannel({
        channelId: 'CARCHIVED',
        name: 'archived',
        status: 'archived',
      }),
    ],
  });

  await openSlackChannelOwnerEditor({
    actionId: slackActionIds.openChannelOwnerEditor,
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    triggerId: 'trigger-1',
  });

  assert.deepEqual(getChannelSelectOptions(slackGateway.openViews[0].view), [
    'CASSIGNED',
    'COTHER',
  ]);
});

test('open syncs Slack bot-joined channels before showing owner candidates', async () => {
  const { channelRepository, deps, slackGateway } = buildDeps({
    channels: [],
  });
  slackGateway.botJoinedChannels = [
    {
      id: 'CJOINED',
      isIm: false,
      isMember: true,
      name: 'joined',
    },
    {
      id: 'CARCHIVED',
      isArchived: true,
      isIm: false,
      isMember: true,
      name: 'archived',
    },
    {
      id: 'DAPP',
      isIm: true,
      isMember: true,
      name: 'dm',
    },
  ];

  await openSlackChannelOwnerEditor({
    actionId: slackActionIds.openChannelOwnerEditor,
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    triggerId: 'trigger-1',
  });

  assert.deepEqual(getChannelSelectOptions(slackGateway.openViews[0].view), [
    'CJOINED',
  ]);
  assert.equal(channelRepository.channels.length, 1);
  assert.deepEqual(channelRepository.channels[0]?.assigneeSlackUserIds, []);
  assert.equal(channelRepository.channels[0]?.createdBySlackUserId, 'UBOT');
  assert.equal(channelRepository.channels[0]?.name, 'joined');
});

test('open still shows repository channels when Slack joined-channel sync fails', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });
  slackGateway.listBotJoinedChannelsError = new Error('Slack API unavailable');

  await openSlackChannelOwnerEditor({
    actionId: slackActionIds.openChannelOwnerEditor,
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    triggerId: 'trigger-1',
  });

  assert.deepEqual(getChannelSelectOptions(slackGateway.openViews[0].view), [
    'C1',
  ]);
});

test('open is no-op without channel-owner edit permission', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });

  await openSlackChannelOwnerEditor({
    actionId: slackActionIds.openChannelOwnerEditor,
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    triggerId: 'trigger-1',
  });

  assert.equal(slackGateway.openViews.length, 0);
});

test('open allows channel-owner editors', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
    workspace: buildWorkspace({
      channelOwnerEditors: {
        emails: ['editor@example.com'],
        slackUserIds: [EDITOR_USER],
      },
    }),
  });

  await openSlackChannelOwnerEditor({
    actionId: slackActionIds.openChannelOwnerEditor,
    deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: EDITOR_USER,
    triggerId: 'trigger-1',
  });

  assert.deepEqual(getChannelSelectOptions(slackGateway.openViews[0].view), [
    'C1',
  ]);
});

test('update calls updateView with view id and hash', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });

  await updateSlackChannelOwnerEditor({
    actionId: slackActionIds.channelOwnerEditorChannel,
    deps,
    selectedOptionValue: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    viewHash: 'hash-1',
    viewId: 'view-1',
  });

  assert.equal(slackGateway.updateViews.length, 1);
  assert.equal(slackGateway.updateViews[0].viewId, 'view-1');
  assert.equal(slackGateway.updateViews[0].hash, 'hash-1');
  assert.equal(slackGateway.updateViews[0].view.private_metadata, 'C1');
});

test('update ignores Slack view hash conflicts', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });
  slackGateway.updateViewError = slackApiError('hash_conflict');

  await updateSlackChannelOwnerEditor({
    actionId: slackActionIds.channelOwnerEditorChannel,
    deps,
    selectedOptionValue: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    viewHash: 'stale-hash',
    viewId: 'view-1',
  });

  assert.equal(slackGateway.updateViews.length, 1);
  assert.equal(slackGateway.updateViews[0].hash, 'stale-hash');
});

test('update rejects non-hash-conflict Slack view errors', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });
  const updateError = slackApiError('invalid_arguments');
  slackGateway.updateViewError = updateError;

  await assert.rejects(
    updateSlackChannelOwnerEditor({
      actionId: slackActionIds.channelOwnerEditorChannel,
      deps,
      selectedOptionValue: 'C1',
      slackTeamId: WORKSPACE_ID,
      slackUserId: ADMIN_USER,
      viewHash: 'hash-1',
      viewId: 'view-1',
    }),
    updateError
  );
});

test('update is no-op when selected channel is not editable', async () => {
  const { deps, slackGateway } = buildDeps({
    channels: [
      buildChannel({
        assigneeSlackUserIds: [OTHER_USER],
        channelId: 'C1',
        name: 'general',
      }),
    ],
  });

  await updateSlackChannelOwnerEditor({
    actionId: slackActionIds.channelOwnerEditorChannel,
    deps,
    selectedOptionValue: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    viewId: 'view-1',
  });

  assert.equal(slackGateway.updateViews.length, 0);
});

test('save updates and clears owners', async () => {
  const { channelRepository, deps } = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });

  await saveSlackChannelOwnerEditor({
    callbackId: slackViewIds.channelOwnerEditor,
    deps,
    privateMetadata: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    stateValues: selectedUsersState(['UNEW', 'UNEW', 'UOTHER']),
  });

  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, [
    'UNEW',
    'UOTHER',
  ]);

  await saveSlackChannelOwnerEditor({
    callbackId: slackViewIds.channelOwnerEditor,
    deps,
    privateMetadata: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    stateValues: selectedUsersState([]),
  });

  assert.deepEqual(channelRepository.channels[0].assigneeSlackUserIds, []);
});

test('save is no-op without private metadata, channel, or permission', async () => {
  const first = buildDeps({
    channels: [buildChannel({ channelId: 'C1', name: 'general' })],
  });

  await saveSlackChannelOwnerEditor({
    callbackId: slackViewIds.channelOwnerEditor,
    deps: first.deps,
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    stateValues: selectedUsersState(['UNEW']),
  });

  assert.deepEqual(first.channelRepository.channels[0].assigneeSlackUserIds, [
    ASSIGNEE_USER,
  ]);

  const second = buildDeps({ channels: [] });

  await saveSlackChannelOwnerEditor({
    callbackId: slackViewIds.channelOwnerEditor,
    deps: second.deps,
    privateMetadata: 'CMISSING',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ADMIN_USER,
    stateValues: selectedUsersState(['UNEW']),
  });

  assert.deepEqual(second.channelRepository.channels, []);

  const third = buildDeps({
    channels: [
      buildChannel({
        assigneeSlackUserIds: [OTHER_USER],
        channelId: 'C1',
        name: 'general',
      }),
    ],
  });

  await saveSlackChannelOwnerEditor({
    callbackId: slackViewIds.channelOwnerEditor,
    deps: third.deps,
    privateMetadata: 'C1',
    slackTeamId: WORKSPACE_ID,
    slackUserId: ASSIGNEE_USER,
    stateValues: selectedUsersState(['UNEW']),
  });

  assert.deepEqual(third.channelRepository.channels[0].assigneeSlackUserIds, [
    OTHER_USER,
  ]);
});
