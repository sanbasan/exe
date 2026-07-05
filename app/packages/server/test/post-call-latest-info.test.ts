import type {
  CallNotificationRecord,
  CallNotificationRepository,
} from '../src/ports';
import type { CallWorkflowDeps } from '../src/workflows/deps';
import {
  applyChannelBlockDraftsFromCall,
  applyChannelReviewDraftsFromCall,
  applyLatestInfoDraftsFromCall,
} from '../src/workflows/post-call-latest-info';
import { finalizeEndedCalls } from '../src/workflows/post-call-workflow';
import {
  callEventSchema,
  callSessionSchema,
  channelBlockSchema,
  channelSchema,
  userProfileSchema,
  workspaceSchema,
  type CallEvent,
  type CallSession,
  type Channel,
  type ChannelBlock,
  type ChannelBlockDraft,
  type ChannelReviewDraft,
  type ChannelReviewState,
  type LatestInfoDraft,
  type Task,
  type UserProfile,
  type Workspace,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T12:00:00.000Z';
const CALL_START = '2026-07-01T11:00:00.000Z';
const CALL_END = '2026-07-01T11:30:00.000Z';
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
  endedAt: CALL_END,
  id: 'call-1',
  liveKitRoomName: 'room-1',
  purpose: 'scheduled_review',
  startedAt: CALL_START,
  status: 'ended',
  updatedAt: CALL_END,
  userId: USER_ID,
  workspaceId: WORKSPACE_ID,
});

const SUMMARY_EVENT = callEventSchema.parse({
  callSessionId: session.id,
  createdAt: CALL_END,
  id: 'summary-event',
  payload: { summary: '通話サマリー' },
  type: 'summary',
  workspaceId: WORKSPACE_ID,
});

const buildChannel = (overrides: Partial<Channel>): Channel =>
  channelSchema.parse({
    assigneeSlackUserIds: [SESSION_SLACK_USER_ID],
    channelId: 'C_TARGET',
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBySlackUserId: SESSION_SLACK_USER_ID,
    latestInfo: '既存の最新情報',
    name: 'project',
    status: 'active',
    updatedAt: '2026-06-01T00:00:00.000Z',
    watcherSlackUserIds: [],
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

const latestInfoProposeEvent = ({
  drafts,
  id,
}: {
  readonly drafts: readonly LatestInfoDraft[];
  readonly id: string;
}): CallEvent =>
  callEventSchema.parse({
    callSessionId: session.id,
    createdAt: CALL_START,
    id,
    payload: { latestInfoDrafts: [...drafts] },
    type: 'latest_info_draft_proposed',
    workspaceId: WORKSPACE_ID,
  });

const latestInfoDiscardEvent = ({
  draftIds,
  id,
}: {
  readonly draftIds: readonly string[];
  readonly id: string;
}): CallEvent =>
  callEventSchema.parse({
    callSessionId: session.id,
    createdAt: CALL_START,
    id,
    payload: { draftIds: [...draftIds] },
    type: 'latest_info_draft_discarded',
    workspaceId: WORKSPACE_ID,
  });

const reviewProposeEvent = ({
  drafts,
  id,
}: {
  readonly drafts: readonly ChannelReviewDraft[];
  readonly id: string;
}): CallEvent =>
  callEventSchema.parse({
    callSessionId: session.id,
    createdAt: CALL_START,
    id,
    payload: { channelReviewDrafts: [...drafts] },
    type: 'channel_review_draft_proposed',
    workspaceId: WORKSPACE_ID,
  });

const reviewDiscardEvent = ({
  draftIds,
  id,
}: {
  readonly draftIds: readonly string[];
  readonly id: string;
}): CallEvent =>
  callEventSchema.parse({
    callSessionId: session.id,
    createdAt: CALL_START,
    id,
    payload: { draftIds: [...draftIds] },
    type: 'channel_review_draft_discarded',
    workspaceId: WORKSPACE_ID,
  });

const blockProposeEvent = ({
  drafts,
  id,
}: {
  readonly drafts: readonly ChannelBlockDraft[];
  readonly id: string;
}): CallEvent =>
  callEventSchema.parse({
    callSessionId: session.id,
    createdAt: CALL_START,
    id,
    payload: { channelBlockDrafts: [...drafts] },
    type: 'channel_block_draft_proposed',
    workspaceId: WORKSPACE_ID,
  });

class RecordingCallNotificationRepository implements CallNotificationRepository {
  public records: readonly CallNotificationRecord[] = [];

  public create = async ({
    record,
  }: {
    readonly record: CallNotificationRecord;
  }): Promise<void> => {
    this.records = [...this.records, record];
  };

  public exists = async (): Promise<boolean> => false;

  public listByScheduledRun = async (): Promise<
    readonly CallNotificationRecord[]
  > => [];

  public updateSlackMessage = async (): Promise<void> => {};
}

interface ReviewCall {
  readonly channelId: string;
  readonly input: {
    readonly lastSelfReport?: string;
    readonly nextCheckAt?: string;
    readonly nextCheckReason?: string;
    readonly statusText?: string;
  };
  readonly slackUserId: string;
}

interface BlockCall {
  readonly blockId?: string;
  readonly channelId?: string;
  readonly input?: { readonly description?: string; readonly title?: string };
  readonly method: string;
}

const createDeps = ({
  channels = [],
  events = [SUMMARY_EVENT],
  existingBlocks = [],
  failReviewChannelIds = new Set<string>(),
  failBlockMethods = new Set<string>(),
  updateLatestInfo,
}: {
  readonly channels?: readonly Channel[];
  readonly events?: readonly CallEvent[];
  readonly existingBlocks?: readonly ChannelBlock[];
  readonly failReviewChannelIds?: ReadonlySet<string>;
  readonly failBlockMethods?: ReadonlySet<string>;
  readonly updateLatestInfo?: (params: {
    readonly channelId: string;
    readonly latestInfo: string;
  }) => void;
}): {
  readonly deps: CallWorkflowDeps;
  readonly getBlockCalls: () => readonly BlockCall[];
  readonly getBlockRepoUpdates: () => readonly ChannelBlock[];
  readonly getErrorReports: () => readonly unknown[];
  readonly getReviewCalls: () => readonly ReviewCall[];
  readonly getSentBlockNotifications: () => readonly {
    readonly blocks: readonly ChannelBlock[];
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly workspace: Workspace;
  }[];
  readonly getUpdatedBlockMessages: () => readonly {
    readonly block: ChannelBlock;
    readonly deleted?: boolean;
  }[];
  readonly getUpdatedLatestInfo: () => readonly {
    readonly channelId: string;
    readonly latestInfo: string;
    readonly slackUserId: string;
  }[];
  readonly getSummaryNotifications: () => readonly {
    readonly channelUpdates?: readonly unknown[];
    readonly summary: string;
  }[];
  readonly notifications: RecordingCallNotificationRepository;
} => {
  let summaryNotifications: readonly {
    readonly channelUpdates?: readonly unknown[];
    readonly summary: string;
  }[] = [];
  let updatedLatestInfo: readonly {
    readonly channelId: string;
    readonly latestInfo: string;
    readonly slackUserId: string;
  }[] = [];
  let reviewCalls: readonly ReviewCall[] = [];
  let blockCalls: readonly BlockCall[] = [];
  let blockRepoUpdates: readonly ChannelBlock[] = [];
  let sentBlockNotifications: readonly {
    readonly blocks: readonly ChannelBlock[];
    readonly channelId: string;
    readonly sessionStartedAt: string;
    readonly speakerSlackUserId: string;
    readonly workspace: Workspace;
  }[] = [];
  let updatedBlockMessages: readonly {
    readonly block: ChannelBlock;
    readonly deleted?: boolean;
  }[] = [];
  let errorReports: readonly unknown[] = [];
  const notifications = new RecordingCallNotificationRepository();
  const blockStore = new Map<string, ChannelBlock>(
    existingBlocks.map((block) => [block.id, block])
  );
  let createdBlockCount = 0;
  // Records the call (keeping the shape existing assertions rely on) and throws
  // for methods in failBlockMethods; block construction lives in each method.
  const recordBlockCall = (call: BlockCall): void => {
    blockCalls = [...blockCalls, call];

    if (failBlockMethods.has(call.method)) {
      throw new Error(`${call.method} failed`);
    }
  };
  const buildSyntheticBlock = ({
    blockId,
    resolved,
  }: {
    readonly blockId: string;
    readonly resolved: boolean;
  }): ChannelBlock =>
    channelBlockSchema.parse({
      channelId: 'C_BLOCK',
      createdAt: NOW,
      createdBySlackUserId: 'U_CALLER',
      description: 'block',
      id: blockId,
      ...(resolved ? { resolvedAt: NOW } : {}),
      status: resolved ? 'resolved' : 'active',
      title: 'block',
      updatedAt: NOW,
      workspaceId: WORKSPACE_ID,
    });
  const deps = {
    callEventRepository: {
      create: async (): Promise<void> => {},
      listByCallSessionId: async (): Promise<readonly CallEvent[]> => events,
    },
    callNotificationRepository: notifications,
    callOverviewComposer: {
      composeCallOverview: async (): Promise<string | null> => null,
    },
    callSessionRepository: {
      listEndedWithoutSummary: async (): Promise<readonly CallSession[]> => [
        session,
      ],
      update: async (): Promise<void> => {},
    },
    channelBlockRepository: {
      getById: async ({
        blockId,
      }: {
        readonly blockId: string;
        readonly workspaceId: string;
      }): Promise<ChannelBlock | null> => blockStore.get(blockId) ?? null,
      update: async ({
        block,
      }: {
        readonly block: ChannelBlock;
      }): Promise<void> => {
        blockStore.set(block.id, block);
        blockRepoUpdates = [...blockRepoUpdates, block];
      },
    },
    channelRepository: {
      listByWorkspace: async (): Promise<readonly Channel[]> => channels,
    },
    channelService: {
      createChannelBlockForSlackUser: async ({
        channelId,
        input,
        slackUserId,
      }: {
        readonly channelId: string;
        readonly input: {
          readonly description?: string;
          readonly title: string;
        };
        readonly slackUserId: string;
      }): Promise<ChannelBlock> => {
        recordBlockCall({
          channelId,
          input,
          method: 'createChannelBlockForSlackUser',
        });
        createdBlockCount += 1;
        const block = channelBlockSchema.parse({
          channelId,
          createdAt: NOW,
          createdBySlackUserId: slackUserId,
          description: input.description ?? input.title,
          id: `created-${String(createdBlockCount)}`,
          status: 'active',
          title: input.title,
          updatedAt: NOW,
          workspaceId: WORKSPACE_ID,
        });
        blockStore.set(block.id, block);

        return block;
      },
      deleteChannelBlockForSlackUser: async ({
        blockId,
      }: {
        readonly blockId: string;
      }): Promise<ChannelBlock> => {
        recordBlockCall({
          blockId,
          method: 'deleteChannelBlockForSlackUser',
        });
        const existing = blockStore.get(blockId);
        blockStore.delete(blockId);

        return existing ?? buildSyntheticBlock({ blockId, resolved: false });
      },
      recordChannelReviewForSlackUser: async ({
        channelId,
        input,
        slackUserId,
      }: {
        readonly channelId: string;
        readonly input: ReviewCall['input'];
        readonly slackUserId: string;
      }): Promise<ChannelReviewState> => {
        reviewCalls = [...reviewCalls, { channelId, input, slackUserId }];

        if (failReviewChannelIds.has(channelId)) {
          throw new Error('recordChannelReviewForSlackUser failed');
        }

        return {} as unknown as ChannelReviewState;
      },
      resolveChannelBlockForSlackUser: async ({
        blockId,
      }: {
        readonly blockId: string;
      }): Promise<ChannelBlock> => {
        recordBlockCall({
          blockId,
          method: 'resolveChannelBlockForSlackUser',
        });
        const existing = blockStore.get(blockId);

        if (existing === undefined) {
          return buildSyntheticBlock({ blockId, resolved: true });
        }

        const resolved = channelBlockSchema.parse({
          ...existing,
          resolvedAt: NOW,
          status: 'resolved',
          updatedAt: NOW,
        });
        blockStore.set(blockId, resolved);

        return resolved;
      },
      updateChannelBlockForSlackUser: async ({
        blockId,
        input,
      }: {
        readonly blockId: string;
        readonly input: {
          readonly description?: string;
          readonly title?: string;
        };
      }): Promise<ChannelBlock> => {
        recordBlockCall({
          blockId,
          input,
          method: 'updateChannelBlockForSlackUser',
        });
        const existing = blockStore.get(blockId);

        if (existing === undefined) {
          return buildSyntheticBlock({ blockId, resolved: false });
        }

        const updated = channelBlockSchema.parse({
          ...existing,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.title === undefined ? {} : { title: input.title }),
          updatedAt: NOW,
        });
        blockStore.set(blockId, updated);

        return updated;
      },
      updateChannelLatestInfoForSlackUser: async ({
        channelId,
        latestInfo,
        slackUserId,
      }: {
        readonly channelId: string;
        readonly latestInfo: string;
        readonly slackUserId: string;
        readonly workspaceId: string;
      }): Promise<Channel> => {
        updateLatestInfo?.({ channelId, latestInfo });
        updatedLatestInfo = [
          ...updatedLatestInfo,
          { channelId, latestInfo, slackUserId },
        ];

        return (
          channels.find((channel) => channel.channelId === channelId) ??
          buildChannel({ channelId, latestInfo })
        );
      },
    },
    clock: { now: () => NOW },
    errorReporter: {
      report: async ({ error }: { readonly error: unknown }): Promise<void> => {
        errorReports = [...errorReports, error];
      },
    },
    notificationGateway: {
      sendCallSummary: async ({
        channelUpdates,
        summary,
      }: {
        readonly channelUpdates?: readonly unknown[];
        readonly summary: string;
      }): Promise<void> => {
        summaryNotifications = [
          ...summaryNotifications,
          {
            ...(channelUpdates === undefined ? {} : { channelUpdates }),
            summary,
          },
        ];
      },
      sendChannelBlocksCreatedFromCall: async ({
        blocks,
        channelId,
        sessionStartedAt,
        speakerSlackUserId,
        workspace: notifiedWorkspace,
      }: {
        readonly blocks: readonly ChannelBlock[];
        readonly channelId: string;
        readonly sessionStartedAt: string;
        readonly speakerSlackUserId: string;
        readonly workspace: Workspace;
      }): Promise<
        readonly {
          readonly blockId: string;
          readonly channelId: string;
          readonly messageTs: string;
          readonly threadTs: string;
        }[]
      > => {
        sentBlockNotifications = [
          ...sentBlockNotifications,
          {
            blocks,
            channelId,
            sessionStartedAt,
            speakerSlackUserId,
            workspace: notifiedWorkspace,
          },
        ];

        return blocks.map((block, index) => ({
          blockId: block.id,
          channelId,
          messageTs: `170000000${String(index)}.000100`,
          threadTs: '1699999999.000100',
        }));
      },
      updateChannelBlockMessage: async ({
        block,
        deleted,
      }: {
        readonly block: ChannelBlock;
        readonly deleted?: boolean;
        readonly workspace: Workspace;
      }): Promise<void> => {
        updatedBlockMessages = [
          ...updatedBlockMessages,
          { block, ...(deleted === undefined ? {} : { deleted }) },
        ];
      },
    },
    taskRepository: {
      create: async (): Promise<void> => {},
      getById: async (): Promise<Task | null> => null,
      listByWorkspace: async (): Promise<readonly Task[]> => [],
    },
    userProfileRepository: {
      getById: async (): Promise<UserProfile> => userProfile,
      listByWorkspace: async (): Promise<readonly UserProfile[]> => [
        userProfile,
      ],
    },
    workspaceRepository: {
      getById: async (): Promise<Workspace> => workspace,
    },
  } as unknown as CallWorkflowDeps;

  return {
    deps,
    getBlockCalls: () => blockCalls,
    getBlockRepoUpdates: () => blockRepoUpdates,
    getErrorReports: () => errorReports,
    getReviewCalls: () => reviewCalls,
    getSentBlockNotifications: () => sentBlockNotifications,
    getSummaryNotifications: () => summaryNotifications,
    getUpdatedBlockMessages: () => updatedBlockMessages,
    getUpdatedLatestInfo: () => updatedLatestInfo,
    notifications,
  };
};

void test('applyLatestInfoDraftsFromCall applies composed drafts to their channels', async () => {
  const { deps, getUpdatedLatestInfo } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            latestInfo: '新しい最新情報',
          },
        ],
        id: 'propose-1',
      }),
    ],
  });

  await applyLatestInfoDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getUpdatedLatestInfo(), [
    {
      channelId: 'C_TARGET',
      latestInfo: '新しい最新情報',
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
});

void test('applyLatestInfoDraftsFromCall keeps the latest revision and drops discarded drafts', async () => {
  const { deps, getUpdatedLatestInfo } = createDeps({
    channels: [
      buildChannel({ channelId: 'C_TARGET' }),
      buildChannel({ channelId: 'C_OTHER', name: 'other' }),
    ],
    events: [
      SUMMARY_EVENT,
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            latestInfo: '初回の下書き',
          },
        ],
        id: 'propose-1',
      }),
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            latestInfo: '修正後の下書き',
          },
        ],
        id: 'propose-2',
      }),
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_OTHER',
            channelName: 'other',
            draftId: 'd2',
            latestInfo: '取り消される下書き',
          },
        ],
        id: 'propose-3',
      }),
      latestInfoDiscardEvent({ draftIds: ['d2'], id: 'discard-1' }),
    ],
  });

  await applyLatestInfoDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getUpdatedLatestInfo(), [
    {
      channelId: 'C_TARGET',
      latestInfo: '修正後の下書き',
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
});

void test('applyChannelReviewDraftsFromCall records the review and returns the change', async () => {
  const { deps, getReviewCalls } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      reviewProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            lastSelfReport: 'ER 図を共有しました。',
            nextCheckAt: '2026-07-05T00:00:00.000Z',
            statusText: '進行中です。',
          },
        ],
        id: 'review-1',
      }),
    ],
  });

  const changes = await applyChannelReviewDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getReviewCalls(), [
    {
      channelId: 'C_TARGET',
      input: {
        lastSelfReport: 'ER 図を共有しました。',
        nextCheckAt: '2026-07-05T00:00:00.000Z',
        statusText: '進行中です。',
      },
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
  assert.deepEqual(changes, [
    {
      channelId: 'C_TARGET',
      channelName: 'project',
      nextCheckAt: '2026-07-05T00:00:00.000Z',
      statusText: '進行中です。',
    },
  ]);
});

void test('applyChannelReviewDraftsFromCall keeps only the last draft per channel', async () => {
  const { deps, getReviewCalls } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      reviewProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            statusText: '最初のステータス。',
          },
        ],
        id: 'review-1',
      }),
      reviewProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
            statusText: '最終のステータス。',
          },
        ],
        id: 'review-2',
      }),
    ],
  });

  await applyChannelReviewDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getReviewCalls(), [
    {
      channelId: 'C_TARGET',
      input: { statusText: '最終のステータス。' },
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
});

void test('applyChannelReviewDraftsFromCall skips discarded drafts', async () => {
  const { deps, getReviewCalls } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      reviewProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            statusText: '取り消されるステータス。',
          },
        ],
        id: 'review-1',
      }),
      reviewDiscardEvent({ draftIds: ['d1'], id: 'discard-1' }),
    ],
  });

  const changes = await applyChannelReviewDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getReviewCalls(), []);
  assert.deepEqual(changes, []);
});

void test('applyChannelBlockDraftsFromCall applies each action with the right service call', async () => {
  const { deps, getBlockCalls } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            description: 'クライアント確認待ち',
            draftId: 'd1',
            title: '承認待ち',
          },
          {
            action: 'update',
            blockId: 'BLOCK1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
            title: 'レビュー待ち',
          },
          {
            action: 'resolve',
            blockId: 'BLOCK2',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd3',
            title: '解消するブロック',
          },
          {
            action: 'delete',
            blockId: 'BLOCK3',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd4',
            title: '削除するブロック',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getBlockCalls(), [
    {
      channelId: 'C_TARGET',
      input: { description: 'クライアント確認待ち', title: '承認待ち' },
      method: 'createChannelBlockForSlackUser',
    },
    {
      blockId: 'BLOCK1',
      input: { title: 'レビュー待ち' },
      method: 'updateChannelBlockForSlackUser',
    },
    {
      blockId: 'BLOCK2',
      method: 'resolveChannelBlockForSlackUser',
    },
    {
      blockId: 'BLOCK3',
      method: 'deleteChannelBlockForSlackUser',
    },
  ]);
});

void test('applyChannelBlockDraftsFromCall skips a create draft missing a title and reports it', async () => {
  const { deps, getBlockCalls, getErrorReports } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
          },
          {
            action: 'resolve',
            blockId: 'BLOCK1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
            title: '解消するブロック',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getBlockCalls(), [
    {
      blockId: 'BLOCK1',
      method: 'resolveChannelBlockForSlackUser',
    },
  ]);
  assert.equal(getErrorReports().length, 1);
});

void test('applyChannelBlockDraftsFromCall reports a failed action and continues with the rest', async () => {
  const { deps, getBlockCalls, getErrorReports } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    failBlockMethods: new Set(['createChannelBlockForSlackUser']),
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            title: '承認待ち',
          },
          {
            action: 'delete',
            blockId: 'BLOCK1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
            title: '削除するブロック',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.deepEqual(getBlockCalls(), [
    {
      channelId: 'C_TARGET',
      input: { title: '承認待ち' },
      method: 'createChannelBlockForSlackUser',
    },
    {
      blockId: 'BLOCK1',
      method: 'deleteChannelBlockForSlackUser',
    },
  ]);
  assert.equal(getErrorReports().length, 1);
});

const buildExistingBlock = (overrides: Partial<ChannelBlock>): ChannelBlock =>
  channelBlockSchema.parse({
    channelId: 'C_TARGET',
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBySlackUserId: SESSION_SLACK_USER_ID,
    description: '資料待ち',
    id: 'BLOCK1',
    status: 'active',
    title: '承認待ち',
    updatedAt: '2026-06-01T00:00:00.000Z',
    workspaceId: WORKSPACE_ID,
    ...overrides,
  });

void test('applyChannelBlockDraftsFromCall posts created blocks to the channel and saves their message references', async () => {
  const { deps, getBlockRepoUpdates, getSentBlockNotifications } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            description: '確認1',
            draftId: 'd1',
            title: 'ブロック1',
          },
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            description: '確認2',
            draftId: 'd2',
            title: 'ブロック2',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  const sent = getSentBlockNotifications();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channelId, 'C_TARGET');
  assert.deepEqual(
    sent[0].blocks.map((block) => block.id),
    ['created-1', 'created-2']
  );
  assert.deepEqual(
    getBlockRepoUpdates().map((block) => ({
      id: block.id,
      messageTs: block.messageTs,
      threadTs: block.threadTs,
    })),
    [
      {
        id: 'created-1',
        messageTs: '1700000000.000100',
        threadTs: '1699999999.000100',
      },
      {
        id: 'created-2',
        messageTs: '1700000001.000100',
        threadTs: '1699999999.000100',
      },
    ]
  );
});

void test('applyChannelBlockDraftsFromCall posts a block created then resolved in the same call in its final state', async () => {
  const { deps, getSentBlockNotifications, getUpdatedBlockMessages } =
    createDeps({
      channels: [buildChannel({ channelId: 'C_TARGET' })],
      events: [
        SUMMARY_EVENT,
        blockProposeEvent({
          drafts: [
            {
              action: 'create',
              channelId: 'C_TARGET',
              channelName: 'project',
              description: '確認待ち',
              draftId: 'd1',
              title: '承認待ち',
            },
            {
              action: 'resolve',
              blockId: 'created-1',
              channelId: 'C_TARGET',
              channelName: 'project',
              draftId: 'd2',
            },
          ],
          id: 'block-1',
        }),
      ],
    });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  const sent = getSentBlockNotifications();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].blocks.length, 1);
  assert.equal(sent[0].blocks[0].id, 'created-1');
  assert.equal(sent[0].blocks[0].status, 'resolved');
  assert.equal(getUpdatedBlockMessages().length, 0);
});

void test('applyChannelBlockDraftsFromCall does not post a block created then deleted in the same call', async () => {
  const { deps, getSentBlockNotifications } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            description: '確認待ち',
            draftId: 'd1',
            title: '承認待ち',
          },
          {
            action: 'delete',
            blockId: 'created-1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.equal(getSentBlockNotifications().length, 0);
});

void test('applyChannelBlockDraftsFromCall rewrites the posted card of an existing block resolved during the call', async () => {
  const { deps, getSentBlockNotifications, getUpdatedBlockMessages } =
    createDeps({
      channels: [buildChannel({ channelId: 'C_TARGET' })],
      existingBlocks: [
        buildExistingBlock({
          messageTs: '1700000000.000100',
          threadTs: '1699999999.000100',
        }),
      ],
      events: [
        SUMMARY_EVENT,
        blockProposeEvent({
          drafts: [
            {
              action: 'resolve',
              blockId: 'BLOCK1',
              channelId: 'C_TARGET',
              channelName: 'project',
              draftId: 'd1',
            },
          ],
          id: 'block-1',
        }),
      ],
    });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  const updated = getUpdatedBlockMessages();
  assert.equal(updated.length, 1);
  assert.equal(updated[0].block.id, 'BLOCK1');
  assert.equal(updated[0].block.status, 'resolved');
  assert.equal(updated[0].deleted, undefined);
  assert.equal(getSentBlockNotifications().length, 0);
});

void test('applyChannelBlockDraftsFromCall rewrites the posted card of an existing block deleted during the call', async () => {
  const { deps, getUpdatedBlockMessages } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    existingBlocks: [
      buildExistingBlock({
        messageTs: '1700000000.000100',
        threadTs: '1699999999.000100',
      }),
    ],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'delete',
            blockId: 'BLOCK1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  const updated = getUpdatedBlockMessages();
  assert.equal(updated.length, 1);
  assert.equal(updated[0].block.id, 'BLOCK1');
  assert.equal(updated[0].deleted, true);
});

void test('applyChannelBlockDraftsFromCall does not rewrite a card for an existing block without a messageTs', async () => {
  const { deps, getUpdatedBlockMessages } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    existingBlocks: [buildExistingBlock({})],
    events: [
      SUMMARY_EVENT,
      blockProposeEvent({
        drafts: [
          {
            action: 'update',
            blockId: 'BLOCK1',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            title: '更新後タイトル',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await applyChannelBlockDraftsFromCall({
    deps,
    events: await deps.callEventRepository.listByCallSessionId({
      callSessionId: session.id,
      workspaceId: WORKSPACE_ID,
    }),
    session,
  });

  assert.equal(getUpdatedBlockMessages().length, 0);
});

void test('finalizeEndedCalls applies latest-info, review, and block drafts and sends the reviewed-channel summary', async () => {
  const {
    deps,
    getBlockCalls,
    getReviewCalls,
    getSummaryNotifications,
    getUpdatedLatestInfo,
  } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            latestInfo: '新しい最新情報',
          },
        ],
        id: 'propose-1',
      }),
      reviewProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd2',
            nextCheckAt: '2026-07-02T00:00:00.000Z',
            statusText: 'ER 図を共有済みです。',
          },
        ],
        id: 'review-1',
      }),
      blockProposeEvent({
        drafts: [
          {
            action: 'create',
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd3',
            title: '承認待ち',
          },
        ],
        id: 'block-1',
      }),
    ],
  });

  await finalizeEndedCalls({ deps });

  assert.deepEqual(getUpdatedLatestInfo(), [
    {
      channelId: 'C_TARGET',
      latestInfo: '新しい最新情報',
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
  assert.deepEqual(getReviewCalls(), [
    {
      channelId: 'C_TARGET',
      input: {
        nextCheckAt: '2026-07-02T00:00:00.000Z',
        statusText: 'ER 図を共有済みです。',
      },
      slackUserId: SESSION_SLACK_USER_ID,
    },
  ]);
  assert.deepEqual(getBlockCalls(), [
    {
      channelId: 'C_TARGET',
      input: { title: '承認待ち' },
      method: 'createChannelBlockForSlackUser',
    },
  ]);
  assert.deepEqual(getSummaryNotifications(), [
    {
      channelUpdates: [
        {
          channelId: 'C_TARGET',
          channelName: 'project',
          nextCheckAt: '2026-07-02T00:00:00.000Z',
          statusText: 'ER 図を共有済みです。',
        },
      ],
      summary: '通話サマリー',
    },
  ]);
});

void test('finalizeEndedCalls continues summary finalization when a latest-info draft apply fails', async () => {
  let updatedSession: CallSession | null = null;
  const originalConsoleError = console.error;
  const { deps, notifications } = createDeps({
    channels: [buildChannel({ channelId: 'C_TARGET' })],
    events: [
      SUMMARY_EVENT,
      latestInfoProposeEvent({
        drafts: [
          {
            channelId: 'C_TARGET',
            channelName: 'project',
            draftId: 'd1',
            latestInfo: '新しい最新情報',
          },
        ],
        id: 'propose-1',
      }),
    ],
    updateLatestInfo: (): void => {
      throw new Error('Firestore unavailable');
    },
  });

  console.error = (): void => {};

  try {
    await finalizeEndedCalls({
      deps: {
        ...deps,
        callSessionRepository: {
          ...deps.callSessionRepository,
          update: async ({ session: nextSession }): Promise<void> => {
            updatedSession = nextSession;
          },
        },
      },
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(updatedSession?.summary, '通話サマリー');
  assert.equal(notifications.records.length, 1);
  assert.equal(notifications.records[0].kind, 'call_summary');
});
