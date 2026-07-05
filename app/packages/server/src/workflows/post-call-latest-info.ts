/* eslint-disable max-lines -- Post-call latest-info, review, and block draft apply are kept together for testable workflow behavior. */
import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallWorkflowDeps } from './deps';
import {
  getIncomingChannelBlockDrafts,
  getIncomingChannelReviewDrafts,
  getIncomingLatestInfoDrafts,
} from './post-call-event-selectors';
import {
  channelBlockSchema,
  type CallEvent,
  type CallSession,
  type ChannelBlock,
  type ChannelBlockDraft,
  type ChannelBlockDraftAction,
  type ChannelReviewDraft,
  type Workspace,
} from '@exe/domain';

// Channels reviewed during the call, surfaced in the Slack call summary with
// their recorded review status and next check. The channel's `latestInfo`
// itself is updated separately from latest-info drafts composed during the
// call (see applyLatestInfoDraftsFromCall).
export interface PostCallLatestInfoChange {
  readonly channelId: string;
  readonly channelName: string;
  readonly nextCheckAt?: string;
  readonly nextCheckReason?: string;
  readonly statusText: string;
}

const normalizeError = (
  error: unknown
): {
  readonly message: string;
  readonly stack?: string;
} => {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return { message: String(error) };
};

const buildReportedError = ({
  channelId,
  error,
  label,
  session,
}: {
  readonly channelId?: string;
  readonly error: unknown;
  readonly label: string;
  readonly session: CallSession;
}): Error => {
  const normalized = normalizeError(error);

  return new Error(
    [
      label,
      `callSessionId=${session.id}`,
      `workspaceId=${session.workspaceId}`,
      ...(channelId === undefined ? [] : [`channelId=${channelId}`]),
      `message=${normalized.message}`,
    ].join(' ')
  );
};

const reportLatestInfoRefreshError = ({
  channelId,
  deps,
  error,
  session,
}: {
  readonly channelId?: string;
  readonly deps: CallWorkflowDeps;
  readonly error: unknown;
  readonly session: CallSession;
}): Promise<void> =>
  deps.errorReporter
    .report({
      context: { route: 'workflows/finalizeEndedCalls/latest-info' },
      error: buildReportedError({
        ...(channelId === undefined ? {} : { channelId }),
        error,
        label: 'Post-call latest info refresh failed',
        session,
      }),
    })
    .catch((): void => undefined);

const reportChannelDraftError = ({
  channelId,
  deps,
  error,
  session,
}: {
  readonly channelId?: string;
  readonly deps: CallWorkflowDeps;
  readonly error: unknown;
  readonly session: CallSession;
}): Promise<void> =>
  deps.errorReporter
    .report({
      context: { route: 'workflows/finalizeEndedCalls/channel-drafts' },
      error: buildReportedError({
        ...(channelId === undefined ? {} : { channelId }),
        error,
        label: 'Post-call channel draft apply failed',
        session,
      }),
    })
    .catch((): void => undefined);

// Apply the latest-info drafts composed during the call to their channels.
// Each draft carries the full composed text; a later revision with the same
// draftId supersedes earlier ones and discarded drafts are dropped (handled by
// getIncomingLatestInfoDrafts). Per-channel failures are reported and skipped.
const applyLatestInfoDraft = ({
  deps,
  draft,
  session,
  slackUserId,
}: {
  readonly deps: CallWorkflowDeps;
  readonly draft: { readonly channelId: string; readonly latestInfo: string };
  readonly session: CallSession;
  readonly slackUserId: string;
}): Promise<void> =>
  deps.channelService
    .updateChannelLatestInfoForSlackUser({
      channelId: draft.channelId,
      latestInfo: draft.latestInfo,
      slackUserId,
      workspaceId: session.workspaceId,
    })
    .then((): void => undefined)
    .catch((error: unknown) =>
      reportLatestInfoRefreshError({
        channelId: draft.channelId,
        deps,
        error,
        session,
      })
    );

export const applyLatestInfoDraftsFromCall = async ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<void> => {
  const drafts = getIncomingLatestInfoDrafts(events);

  if (drafts.length === 0) {
    return;
  }

  const { linkedSlackUser } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });

  await Promise.all(
    drafts.map((draft) =>
      applyLatestInfoDraft({
        deps,
        draft,
        session,
        slackUserId: linkedSlackUser.slackUserId,
      })
    )
  );
};

export const applyLatestInfoDraftsFromCallBestEffort = ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<void> =>
  applyLatestInfoDraftsFromCall({ deps, events, session }).catch(
    (error: unknown) =>
      reportLatestInfoRefreshError({ deps, error, session }).then(
        (): void => undefined
      )
  );

// Apply the caller's channel-review status drafts recorded during the call.
// Each draft becomes a recordChannelReviewForSlackUser call; the resulting
// change is surfaced in the Slack call summary. Per-draft failures are reported
// and skipped so the rest still apply.
const applyChannelReviewDraft = ({
  deps,
  draft,
  session,
  slackUserId,
}: {
  readonly deps: CallWorkflowDeps;
  readonly draft: ChannelReviewDraft;
  readonly session: CallSession;
  readonly slackUserId: string;
}): Promise<PostCallLatestInfoChange | null> =>
  deps.channelService
    .recordChannelReviewForSlackUser({
      channelId: draft.channelId,
      input: {
        ...(draft.lastSelfReport === undefined
          ? {}
          : { lastSelfReport: draft.lastSelfReport }),
        ...(draft.nextCheckAt === undefined
          ? {}
          : { nextCheckAt: draft.nextCheckAt }),
        ...(draft.nextCheckReason === undefined
          ? {}
          : { nextCheckReason: draft.nextCheckReason }),
        statusText: draft.statusText,
      },
      slackUserId,
      workspaceId: session.workspaceId,
    })
    .then(
      (): PostCallLatestInfoChange => ({
        channelId: draft.channelId,
        channelName: draft.channelName,
        ...(draft.nextCheckAt === undefined
          ? {}
          : { nextCheckAt: draft.nextCheckAt }),
        ...(draft.nextCheckReason === undefined
          ? {}
          : { nextCheckReason: draft.nextCheckReason }),
        statusText: draft.statusText,
      })
    )
    .catch((error: unknown) =>
      reportLatestInfoRefreshError({
        channelId: draft.channelId,
        deps,
        error,
        session,
      }).then((): null => null)
    );

export const applyChannelReviewDraftsFromCall = async ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<readonly PostCallLatestInfoChange[]> => {
  const drafts = getIncomingChannelReviewDrafts(events);

  if (drafts.length === 0) {
    return [];
  }

  const { linkedSlackUser } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });
  const changes = await Promise.all(
    drafts.map((draft) =>
      applyChannelReviewDraft({
        deps,
        draft,
        session,
        slackUserId: linkedSlackUser.slackUserId,
      })
    )
  );

  return changes.flatMap((change) => (change === null ? [] : [change]));
};

export const applyChannelReviewDraftsFromCallBestEffort = ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<readonly PostCallLatestInfoChange[]> =>
  applyChannelReviewDraftsFromCall({ deps, events, session }).catch(
    (error: unknown) =>
      reportLatestInfoRefreshError({ deps, error, session }).then(
        (): readonly PostCallLatestInfoChange[] => []
      )
  );

// Apply a single channel-block draft. Returns null when a required field is
// missing (so the caller reports and skips it); otherwise the service promise.
interface BlockActionParams {
  readonly deps: CallWorkflowDeps;
  readonly draft: ChannelBlockDraft;
  readonly slackUserId: string;
  readonly workspaceId: string;
}

// A draft that was applied successfully, kept so the post-apply Slack sync can
// post created blocks to the channel and rewrite cards of changed ones.
interface ChannelBlockApplyResult {
  readonly action: ChannelBlockDraftAction;
  readonly block: ChannelBlock;
}

const runCreateBlockAction = ({
  deps,
  draft,
  slackUserId,
  workspaceId,
}: BlockActionParams): Promise<ChannelBlock> | null =>
  draft.title === undefined
    ? null
    : deps.channelService.createChannelBlockForSlackUser({
        channelId: draft.channelId,
        input: {
          ...(draft.description === undefined
            ? {}
            : { description: draft.description }),
          title: draft.title,
        },
        slackUserId,
        workspaceId,
      });

const runUpdateBlockAction = ({
  deps,
  draft,
  slackUserId,
  workspaceId,
}: BlockActionParams): Promise<ChannelBlock> | null =>
  draft.blockId === undefined
    ? null
    : deps.channelService.updateChannelBlockForSlackUser({
        blockId: draft.blockId,
        input: {
          ...(draft.description === undefined
            ? {}
            : { description: draft.description }),
          ...(draft.title === undefined ? {} : { title: draft.title }),
        },
        slackUserId,
        workspaceId,
      });

const runResolveBlockAction = ({
  deps,
  draft,
  slackUserId,
  workspaceId,
}: BlockActionParams): Promise<ChannelBlock> | null =>
  draft.blockId === undefined
    ? null
    : deps.channelService.resolveChannelBlockForSlackUser({
        blockId: draft.blockId,
        slackUserId,
        workspaceId,
      });

const runDeleteBlockAction = ({
  deps,
  draft,
  slackUserId,
  workspaceId,
}: BlockActionParams): Promise<ChannelBlock> | null =>
  draft.blockId === undefined
    ? null
    : deps.channelService.deleteChannelBlockForSlackUser({
        blockId: draft.blockId,
        slackUserId,
        workspaceId,
      });

const runChannelBlockAction = (
  params: BlockActionParams
): Promise<ChannelBlock> | null => {
  switch (params.draft.action) {
    case 'create':
      return runCreateBlockAction(params);
    case 'update':
      return runUpdateBlockAction(params);
    case 'resolve':
      return runResolveBlockAction(params);
    case 'delete':
      return runDeleteBlockAction(params);
  }
};

const applyChannelBlockDraft = ({
  deps,
  draft,
  session,
  slackUserId,
}: {
  readonly deps: CallWorkflowDeps;
  readonly draft: ChannelBlockDraft;
  readonly session: CallSession;
  readonly slackUserId: string;
}): Promise<ChannelBlockApplyResult | null> => {
  const action = runChannelBlockAction({
    deps,
    draft,
    slackUserId,
    workspaceId: session.workspaceId,
  });

  if (action === null) {
    return reportChannelDraftError({
      channelId: draft.channelId,
      deps,
      error: new Error(
        `Channel block draft for action ${draft.action} was missing a required field`
      ),
      session,
    }).then((): null => null);
  }

  return action
    .then((block): ChannelBlockApplyResult => ({ action: draft.action, block }))
    .catch((error: unknown) =>
      reportChannelDraftError({
        channelId: draft.channelId,
        deps,
        error,
        session,
      }).then((): null => null)
    );
};

// Block drafts are applied sequentially (in the order recorded) so a later
// resolve/delete for a block created earlier in the same call sees it.
const applyChannelBlockDraftsSequentially = async ({
  deps,
  drafts,
  session,
  slackUserId,
}: {
  readonly deps: CallWorkflowDeps;
  readonly drafts: readonly ChannelBlockDraft[];
  readonly session: CallSession;
  readonly slackUserId: string;
}): Promise<readonly ChannelBlockApplyResult[]> => {
  const [draft, ...remainingDrafts] = drafts;

  if (draft === undefined) {
    return [];
  }

  const result = await applyChannelBlockDraft({
    deps,
    draft,
    session,
    slackUserId,
  });
  const remainingResults = await applyChannelBlockDraftsSequentially({
    deps,
    drafts: remainingDrafts,
    session,
    slackUserId,
  });

  return result === null ? remainingResults : [result, ...remainingResults];
};

// Post blocks created during the call to their channel as an anchor message
// plus one card per block in the anchor thread (same shape as tasks created
// from a call), then save each card's messageTs/threadTs on the block.
const notifyChannelBlocksCreatedFromCallChannel = async ({
  blocks,
  channelId,
  deps,
  session,
  speakerSlackUserId,
  workspace,
}: {
  readonly blocks: readonly ChannelBlock[];
  readonly channelId: string;
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly speakerSlackUserId: string;
  readonly workspace: Workspace;
}): Promise<void> => {
  const references =
    await deps.notificationGateway.sendChannelBlocksCreatedFromCall({
      blocks,
      channelId,
      sessionStartedAt: session.startedAt ?? session.createdAt,
      speakerSlackUserId,
      workspace,
    });

  await Promise.all(
    references.map((reference) => {
      const block = blocks.find(
        (candidate) => candidate.id === reference.blockId
      );

      if (block === undefined) {
        return Promise.resolve();
      }

      return deps.channelBlockRepository.update({
        block: channelBlockSchema.parse({
          ...block,
          messageTs: reference.messageTs,
          threadTs: reference.threadTs,
        }),
      });
    })
  );
};

const notifyChannelBlocksCreatedFromCall = async ({
  deps,
  results,
  session,
  speakerSlackUserId,
  workspace,
}: {
  readonly deps: CallWorkflowDeps;
  readonly results: readonly ChannelBlockApplyResult[];
  readonly session: CallSession;
  readonly speakerSlackUserId: string;
  readonly workspace: Workspace;
}): Promise<void> => {
  const deletedBlockIds = new Set(
    results
      .filter((result) => result.action === 'delete')
      .map((result) => result.block.id)
  );
  const createdBlockIds = results
    .filter((result) => result.action === 'create')
    .map((result) => result.block.id)
    .filter((blockId) => !deletedBlockIds.has(blockId));

  if (createdBlockIds.length === 0) {
    return;
  }

  // Re-read each created block so the posted card reflects any update/resolve
  // applied later in the same call.
  const currentBlocks = (
    await Promise.all(
      createdBlockIds.map((blockId) =>
        deps.channelBlockRepository.getById({
          blockId,
          workspaceId: session.workspaceId,
        })
      )
    )
  ).filter((block): block is ChannelBlock => block !== null);
  const channelIds = [
    ...new Set(currentBlocks.map((block) => block.channelId)),
  ];

  await Promise.all(
    channelIds.map((channelId) =>
      notifyChannelBlocksCreatedFromCallChannel({
        blocks: currentBlocks.filter((block) => block.channelId === channelId),
        channelId,
        deps,
        session,
        speakerSlackUserId,
        workspace,
      }).catch((error: unknown) =>
        reportChannelDraftError({ channelId, deps, error, session })
      )
    )
  );
};

// Rewrite the posted cards of pre-existing blocks changed during the call
// (update/resolve/delete). Blocks created in the same call are excluded: their
// apply results carry no messageTs, and their cards are posted afterwards with
// the final state anyway.
const refreshChannelBlockMessages = async ({
  deps,
  results,
  session,
  workspace,
}: {
  readonly deps: CallWorkflowDeps;
  readonly results: readonly ChannelBlockApplyResult[];
  readonly session: CallSession;
  readonly workspace: Workspace;
}): Promise<void> => {
  const latestResultByBlockId = new Map(
    results
      .filter((result) => result.action !== 'create')
      .filter((result) => result.block.messageTs !== undefined)
      .map((result) => [result.block.id, result])
  );

  await Promise.all(
    [...latestResultByBlockId.values()].map((result) =>
      deps.notificationGateway
        .updateChannelBlockMessage({
          block: result.block,
          ...(result.action === 'delete' ? { deleted: true } : {}),
          workspace,
        })
        .catch((error: unknown) =>
          reportChannelDraftError({
            channelId: result.block.channelId,
            deps,
            error,
            session,
          })
        )
    )
  );
};

export const applyChannelBlockDraftsFromCall = async ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<void> => {
  const drafts = getIncomingChannelBlockDrafts(events);

  if (drafts.length === 0) {
    return;
  }

  const { linkedSlackUser, workspace } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });

  const results = await applyChannelBlockDraftsSequentially({
    deps,
    drafts,
    session,
    slackUserId: linkedSlackUser.slackUserId,
  });

  await notifyChannelBlocksCreatedFromCall({
    deps,
    results,
    session,
    speakerSlackUserId: linkedSlackUser.slackUserId,
    workspace,
  });
  await refreshChannelBlockMessages({ deps, results, session, workspace });
};

export const applyChannelBlockDraftsFromCallBestEffort = ({
  deps,
  events,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly events: readonly CallEvent[];
  readonly session: CallSession;
}): Promise<void> =>
  applyChannelBlockDraftsFromCall({ deps, events, session }).catch(
    (error: unknown) => reportChannelDraftError({ deps, error, session })
  );
