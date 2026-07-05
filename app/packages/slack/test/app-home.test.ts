import { buildAppHomeView, slackActionIds } from '../src';
import { buildHomeChannelSection } from '../src/app-home/channel-section';
import { buildSettingsSection } from '../src/app-home/settings-section';
import type {
  Channel,
  ChannelBlock,
  ChannelReviewState,
  WorkTask,
} from '@exe/domain';
import type { KnownBlock } from '@slack/types';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-27T00:00:00.000Z';

const buildChannel = (overrides: Partial<Channel>): Channel => ({
  assigneeSlackUserIds: ['UOWNER1'],
  channelId: 'C123',
  createdAt: NOW,
  createdBySlackUserId: 'UCREATOR',
  name: 'general',
  status: 'active',
  updatedAt: NOW,
  watcherSlackUserIds: [],
  workspaceId: 'T123',
  ...overrides,
});

const buildChannelBlock = (overrides: Partial<ChannelBlock>): ChannelBlock => ({
  channelId: 'C123',
  createdAt: NOW,
  createdBySlackUserId: 'UOWNER1',
  description: '先方の承認が来るまで実装に入れない',
  id: 'BLOCK1',
  status: 'active',
  title: '承認待ち',
  updatedAt: NOW,
  workspaceId: 'T123',
  ...overrides,
});

const buildChannelReviewState = (
  overrides: Partial<ChannelReviewState>
): ChannelReviewState => ({
  channelId: 'C123',
  createdAt: NOW,
  id: 'C123:UOWNER1',
  lastCheckedAt: NOW,
  slackUserId: 'UOWNER1',
  statusText: 'レビュー待ちを進めています。',
  statusUpdatedAt: '2026-06-27T03:30:00.000Z',
  updatedAt: '2026-06-27T03:30:00.000Z',
  workspaceId: 'T123',
  ...overrides,
});

const buildWorkTask = (overrides: Partial<WorkTask>): WorkTask => ({
  assigneeSlackUserIds: ['UOWNER1'],
  channelId: 'C123',
  completedAt: null,
  createdAt: NOW,
  id: 'TASK1',
  kind: 'work',
  requesterSlackUserIds: ['UREQ1'],
  status: 'active',
  title: 'Ship review',
  updatedAt: NOW,
  workspaceId: 'T123',
  ...overrides,
});

const actionIds = (
  blocks: readonly ReturnType<typeof buildSettingsSection>[number][]
) =>
  blocks
    .filter((block) => block.type === 'actions')
    .flatMap((block) => block.elements)
    .flatMap((element) =>
      element.type === 'button' ? [element.action_id] : []
    );

const blockTypes = (blocks: ReturnType<typeof buildHomeChannelSection>) =>
  blocks.map((block) => block.type);

const sectionTexts = (blocks: ReturnType<typeof buildHomeChannelSection>) =>
  blocks
    .filter((block) => block.type === 'section')
    .map((block) => block.text.text);

const contextTexts = (blocks: ReturnType<typeof buildHomeChannelSection>) =>
  blocks
    .filter((block) => block.type === 'context')
    .flatMap((block) => block.elements)
    .flatMap((element) => (element.type === 'mrkdwn' ? [element.text] : []));

const buttonActionIds = (blocks: readonly KnownBlock[]): readonly string[] =>
  blocks.flatMap((block) =>
    block.type === 'section' && block.accessory?.type === 'button'
      ? [block.accessory.action_id]
      : []
  );

test('settings section shows buttons based on per-button permissions', () => {
  const adminAndEditorActions = actionIds(
    buildSettingsSection({
      canEditChannelOwners: true,
      canManageWorkspaceSettings: true,
      language: 'en',
    })
  );
  const editorOnlyActions = actionIds(
    buildSettingsSection({
      canEditChannelOwners: true,
      canManageWorkspaceSettings: false,
      language: 'en',
    })
  );
  const regularUserActions = actionIds(
    buildSettingsSection({
      canEditChannelOwners: false,
      canManageWorkspaceSettings: false,
      language: 'en',
    })
  );

  assert.deepEqual(adminAndEditorActions, [
    slackActionIds.openSettings,
    slackActionIds.openManageAdmins,
    slackActionIds.openGbrainConnect,
    slackActionIds.openChannelOwnerEditor,
    slackActionIds.openChannelWatchSettings,
  ]);
  assert.deepEqual(editorOnlyActions, [
    slackActionIds.openChannelOwnerEditor,
    slackActionIds.openChannelWatchSettings,
  ]);
  assert.deepEqual(regularUserActions, [
    slackActionIds.openChannelWatchSettings,
  ]);
});

test('channel section orders latest info, blocks, assigned tasks, requested tasks', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [buildChannelBlock({})],
    channels: [
      buildChannel({
        latestInfo: '出荷レビュー待ち',
        latestInfoUpdatedAt: '2026-06-27T03:00:00.000Z',
      }),
    ],
    language: 'ja',
    now: NOW,
    reviewStates: [
      buildChannelReviewState({
        nextCheckAt: '2026-06-28T01:00:00.000Z',
        statusText: '**進捗**\n\nレビュー待ちを進めています。',
      }),
    ],
    requestedWorkTasks: [
      buildWorkTask({
        id: 'TASK2',
        requesterSlackUserIds: ['UOWNER1'],
        title: '依頼した確認',
      }),
    ],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [buildWorkTask({ title: '担当レビュー' })],
  });
  const texts = sectionTexts(blocks);

  assert.equal(contextTexts(blocks).at(0), '出荷レビュー待ち');
  assert.ok(!contextTexts(blocks).some((text) => text.includes('最新情報')));
  assert.match(texts.at(0) ?? '', /\*個人別の状況\*/u);
  assert.match(contextTexts(blocks).at(1) ?? '', /<@UOWNER1>/u);
  assert.match(
    contextTexts(blocks).at(1) ?? '',
    /\*<@UOWNER1>\*  06\/27 \(土\) 12:30/u
  );
  assert.doesNotMatch(contextTexts(blocks).at(1) ?? '', /^•/u);
  assert.doesNotMatch(contextTexts(blocks).at(1) ?? '', /Next check/u);
  assert.doesNotMatch(contextTexts(blocks).at(1) ?? '', /\n\n/u);
  assert.match(contextTexts(blocks).at(1) ?? '', /\*進捗\*/u);
  assert.doesNotMatch(contextTexts(blocks).at(1) ?? '', /\*\*進捗\*\*/u);
  assert.match(texts.at(1) ?? '', /\*ブロック\*/u);
  assert.match(texts.at(2) ?? '', /^\*承認待ち\*/u);
  // The description shares the buttoned section (a separate context block
  // would leave a gap below the button-height section).
  assert.match(texts.at(2) ?? '', /\n先方の承認が来るまで実装に入れない$/u);
  assert.ok(
    !contextTexts(blocks).some((text) =>
      text.includes('先方の承認が来るまで実装に入れない')
    )
  );
  assert.ok(
    buttonActionIds(blocks).includes(slackActionIds.resolveChannelBlock)
  );
  assert.match(texts.at(3) ?? '', /\*担当タスク\*/u);
  assert.match(texts.at(4) ?? '', /担当レビュー/u);
  assert.match(texts.at(5) ?? '', /\*依頼したタスク\*/u);
  assert.match(texts.at(6) ?? '', /依頼した確認/u);
});

test('each list item has a divider directly above it', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [buildChannelBlock({}), buildChannelBlock({ id: 'BLOCK2' })],
    channels: [buildChannel({ latestInfo: '進行中' })],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [
      buildWorkTask({ id: 'TASK1', title: '担当レビュー1' }),
      buildWorkTask({ id: 'TASK2', title: '担当レビュー2' }),
    ],
  });
  const types = blockTypes(blocks);

  assert.deepEqual(types.slice(0, 12), [
    'header',
    'context',
    'section',
    'divider',
    'section',
    'divider',
    'section',
    'section',
    'divider',
    'section',
    'divider',
    'section',
  ]);
});

test('empty channels are skipped', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [],
    channels: [buildChannel({})],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [],
  });

  assert.deepEqual(blockTypes(blocks), []);
  assert.deepEqual(sectionTexts(blocks), []);
  assert.deepEqual(contextTexts(blocks), []);
});

test('non-empty channels are separated by spacing, not dividers', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [],
    channels: [
      buildChannel({ channelId: 'C1', latestInfo: '進行中', name: 'first' }),
      buildChannel({ channelId: 'C2', latestInfo: '確認中', name: 'second' }),
    ],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [],
  });

  assert.deepEqual(blockTypes(blocks), [
    'header',
    'context',
    'context',
    'header',
    'context',
    'context',
  ]);
  assert.equal(
    blocks.some((block) => block.type === 'divider'),
    false
  );
  assert.equal(contextTexts(blocks).filter((text) => text === ' ').length, 2);
});

test('block titles link to their anchor message when messageTs is present', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [
      buildChannelBlock({
        messageTs: '1710000000.222222',
        threadTs: '1710000000.111111',
      }),
    ],
    channels: [buildChannel({})],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [],
  });
  const blockText = sectionTexts(blocks).find((text) =>
    text.includes('承認待ち')
  );

  assert.match(
    blockText ?? '',
    /<https:\/\/example\.slack\.com\/archives\/C123\/p1710000000222222\?thread_ts=1710000000\.111111&cid=C123\|\*承認待ち\*>/u
  );
});

test('task links follow topaz-style Slack message URLs with thread_ts', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [],
    channels: [buildChannel({})],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [
      buildWorkTask({
        id: 'TASK1',
        messageTs: '1710000000.222222',
        threadTs: '1710000000.111111',
        title: '担当レビュー',
      }),
    ],
  });
  const taskText = sectionTexts(blocks).find((text) =>
    text.includes('担当レビュー')
  );

  assert.match(
    taskText ?? '',
    /https:\/\/example\.slack\.com\/archives\/C123\/p1710000000222222\?thread_ts=1710000000\.111111&cid=C123/u
  );
});

test('task links infer thread_ts from legacy Slack task ids', () => {
  const blocks = buildHomeChannelSection({
    appUrl: 'https://example.com/workspaces/T123',
    blocks: [],
    channels: [buildChannel({})],
    language: 'ja',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [
      buildWorkTask({
        id: 'slack_C123_1710000000_111111',
        messageTs: '1710000000.222222',
        title: '担当レビュー',
      }),
    ],
  });
  const taskText = sectionTexts(blocks).find((text) =>
    text.includes('担当レビュー')
  );

  assert.match(
    taskText ?? '',
    /https:\/\/example\.slack\.com\/archives\/C123\/p1710000000222222\?thread_ts=1710000000\.111111&cid=C123/u
  );
});

test('app home top-level order has no Channels or Admin heading', () => {
  const view = buildAppHomeView({
    appUrl: 'https://example.com/workspaces/T123',
    canEditChannelOwners: true,
    canManageAdmins: true,
    channelBlocks: [],
    channels: [buildChannel({ latestInfo: '進行中' })],
    language: 'en',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    schedule: {
      createdAt: NOW,
      enabled: true,
      excludedDates: [],
      id: 'SCHEDULE1',
      nextRunAt: '2026-06-30T11:00:00.000Z',
      preNotifyMinutes: 10,
      timeOfDay: '09:00',
      timezone: 'Asia/Tokyo',
      updatedAt: NOW,
      userId: 'USER1',
      weekdays: [1, 2, 3, 4, 5],
      workspaceId: 'T123',
    },
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [],
  });
  const headerTexts = view.blocks
    .filter((block) => block.type === 'header')
    .map((block) => block.text.text);

  assert.deepEqual(headerTexts, ['Review call', '#general', ':gear: Settings']);
});

test('admin controls are integrated into settings section', () => {
  const view = buildAppHomeView({
    appUrl: 'https://example.com/workspaces/T123',
    canEditChannelOwners: false,
    canManageAdmins: true,
    channelBlocks: [],
    channels: [],
    language: 'en',
    now: NOW,
    reviewStates: [],
    requestedWorkTasks: [],
    schedule: null,
    slackDomain: 'example',
    timezone: 'Asia/Tokyo',
    workTasks: [],
  });
  const buttons = view.blocks
    .filter((block) => block.type === 'actions')
    .flatMap((block) => block.elements)
    .filter((element) => element.type === 'button');

  assert.equal(
    buttons.find((button) => button.action_id === slackActionIds.openSettings)
      ?.text.text,
    ':gear: General Settings'
  );
  assert.equal(
    buttons.find(
      (button) => button.action_id === slackActionIds.openManageAdmins
    )?.text.text,
    ':busts_in_silhouette: Manage Accounts'
  );
});
