/* eslint-disable max-lines -- Post-call finalization keeps patch, draft, notification, and summary steps together. */
import { notFoundError } from '#server/errors';
import { syncChannelAssigneesForTaskBestEffort } from '#server/services/channel-assignee-sync';
import { getWorkspaceForUser } from '#server/workspace-access';
import type { CallWorkflowDeps } from './deps';
import { createTaskChannelEvent } from './post-call-channel-events';
import {
  getAppliedPatchKeys,
  getAnsweredFollowUpTaskIds,
  getIncomingFollowUpDrafts,
  getIncomingPatches,
  getIncomingWorkTaskDrafts,
  getPatchKey,
  getSummary,
} from './post-call-event-selectors';
import {
  buildApprovedFollowUpTaskId,
  buildApprovedWorkTaskId,
  tryClaimCallSummaryNotification,
  tryClaimFollowUpAnswerNotification,
} from './post-call-idempotency';
import {
  applyChannelBlockDraftsFromCallBestEffort,
  applyChannelReviewDraftsFromCallBestEffort,
  applyLatestInfoDraftsFromCallBestEffort,
} from './post-call-latest-info';
import type { PostCallLatestInfoChange } from './post-call-latest-info';
import { notifyTasksCreatedFromCallBestEffort } from './post-call-task-created-notifications';
import { notifyPatchApplied } from './post-call-task-patch-notifications';
import {
  applyTaskPatch,
  callEventSchema,
  callSessionSchema,
  createFollowUpTaskFromDraft,
  createWorkTaskFromDraft,
  isFollowUpTask,
  type CallSession,
  type FollowUpTaskDraft,
  type Task,
  type TaskPatch,
  type WorkTaskDraft,
} from '@exe/domain';

const recordPatchAppliedEvent = async ({
  deps,
  patch,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly patch: TaskPatch;
  readonly session: CallSession;
}): Promise<void> => {
  await deps.callEventRepository.create({
    event: callEventSchema.parse({
      callSessionId: session.id,
      createdAt: deps.clock.now(),
      id: deps.idGenerator.generateId(),
      payload: { patches: [patch] },
      type: 'task_patch_applied',
      workspaceId: session.workspaceId,
    }),
  });
};

const applyApprovedPatch = async ({
  deps,
  patch,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly patch: TaskPatch;
  readonly session: CallSession;
}): Promise<Task> => {
  const task = await deps.taskRepository.getById({
    taskId: patch.taskId,
    workspaceId: session.workspaceId,
  });

  if (task === null) {
    throw notFoundError(`Task ${patch.taskId} was not found.`);
  }

  const updatedTask = applyTaskPatch({
    now: deps.clock.now(),
    patch,
    task,
  });

  await deps.taskRepository.update({ task: updatedTask });
  await syncChannelAssigneesForTaskBestEffort({
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    previousTask: task,
    task: updatedTask,
  });
  await createTaskChannelEvent({ deps, session, task: updatedTask });
  await recordPatchAppliedEvent({ deps, patch, session });
  await notifyPatchApplied({
    deps,
    patch,
    previousTask: task,
    session,
    task: updatedTask,
  });

  return updatedTask;
};

const applyApprovedPatches = async ({
  deps,
  patches,
  session,
  updatedTasks = [],
}: {
  readonly deps: CallWorkflowDeps;
  readonly patches: readonly TaskPatch[];
  readonly session: CallSession;
  readonly updatedTasks?: readonly Task[];
}): Promise<readonly Task[]> => {
  const [patch, ...remainingPatches] = patches;

  if (patch === undefined) {
    return updatedTasks;
  }

  const updatedTask = await applyApprovedPatch({ deps, patch, session });

  return applyApprovedPatches({
    deps,
    patches: remainingPatches,
    session,
    updatedTasks: [...updatedTasks, updatedTask],
  });
};

const createApprovedFollowUpTask = async ({
  deps,
  draft,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly draft: FollowUpTaskDraft;
  readonly session: CallSession;
}): Promise<Task | null> => {
  const taskId = buildApprovedFollowUpTaskId({ draft, session });
  const existingTask = await deps.taskRepository.getById({
    taskId,
    workspaceId: session.workspaceId,
  });

  if (existingTask !== null) {
    return null;
  }

  const task = createFollowUpTaskFromDraft({
    draft,
    id: taskId,
    now: deps.clock.now(),
    workspaceId: session.workspaceId,
  });

  await deps.taskRepository.create({ task });
  await syncChannelAssigneesForTaskBestEffort({
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    task,
  });
  await createTaskChannelEvent({ deps, session, task });

  return task;
};

const createApprovedWorkTask = async ({
  deps,
  draft,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly draft: WorkTaskDraft;
  readonly session: CallSession;
}): Promise<Task | null> => {
  const taskId = buildApprovedWorkTaskId({ draft, session });
  const existingTask = await deps.taskRepository.getById({
    taskId,
    workspaceId: session.workspaceId,
  });

  if (existingTask !== null) {
    return null;
  }

  const task = createWorkTaskFromDraft({
    draft,
    id: taskId,
    now: deps.clock.now(),
    workspaceId: session.workspaceId,
  });

  await deps.taskRepository.create({ task });
  await syncChannelAssigneesForTaskBestEffort({
    channelRepository: deps.channelRepository,
    clock: deps.clock,
    task,
  });
  await createTaskChannelEvent({ deps, session, task });

  return task;
};

const isCreatedTask = (task: Task | null): task is Task => task !== null;

const sendFollowUpAnswers = async ({
  answeredFollowUpTaskIds,
  deps,
  session,
  tasks,
}: {
  readonly answeredFollowUpTaskIds: ReadonlySet<string>;
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly tasks: readonly Task[];
}): Promise<void> => {
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: session.workspaceId,
  });

  if (workspace === null) {
    throw notFoundError(`Workspace ${session.workspaceId} was not found.`);
  }

  const answeredTasks = tasks
    .filter(isFollowUpTask)
    .filter(
      (task) =>
        answeredFollowUpTaskIds.has(task.id) &&
        task.status === 'completed' &&
        task.followUpAnswer !== undefined
    );

  await Promise.all(
    answeredTasks.flatMap((task) =>
      task.requesterSlackUserIds.map(async (requesterSlackUserId) => {
        const shouldSend = await tryClaimFollowUpAnswerNotification({
          deps,
          requesterSlackUserId,
          session,
          task,
        });

        if (!shouldSend) {
          return;
        }

        await deps.notificationGateway.sendFollowUpAnswer({
          requesterSlackUserId,
          task,
          workspace,
        });
      })
    )
  );
};

const updateSessionSummary = async ({
  deps,
  session,
  summary,
}: {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly summary: string;
}): Promise<CallSession> => {
  const nextSession = callSessionSchema.parse({
    ...session,
    summary,
    updatedAt: deps.clock.now(),
  });

  await deps.callSessionRepository.update({ session: nextSession });

  return nextSession;
};

// One-line "what this call was" for the top of the Slack DM. Best-effort: a
// composer failure is reported and the DM goes out without the line.
const composeCallOverviewBestEffort = ({
  channelUpdates,
  createdTasks,
  deps,
  session,
  updatedTasks,
}: {
  readonly channelUpdates: readonly PostCallLatestInfoChange[];
  readonly createdTasks: readonly Task[];
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
  readonly updatedTasks: readonly Task[];
}): Promise<string | null> =>
  deps.callOverviewComposer
    .composeCallOverview({
      callSessionId: session.id,
      createdTaskTitles: createdTasks.map((task) => task.title),
      purpose: session.purpose,
      reviewedChannelNames: channelUpdates.map((update) => update.channelName),
      updatedTaskTitles: updatedTasks.map((task) => task.title),
      workspaceId: session.workspaceId,
    })
    .catch(async (error: unknown) => {
      await deps.errorReporter
        .report({
          context: { route: 'workflows/finalizeEndedCalls/call-overview' },
          error,
        })
        .catch((): void => undefined);

      return null;
    });

const sendCallSummary = async ({
  channelUpdates,
  deps,
  overview,
  session,
  summary,
}: {
  readonly channelUpdates: readonly PostCallLatestInfoChange[];
  readonly deps: CallWorkflowDeps;
  readonly overview: string | null;
  readonly session: CallSession;
  readonly summary: string;
}): Promise<void> => {
  const { linkedSlackUser, workspace } = await getWorkspaceForUser({
    userId: session.userId,
    userProfileRepository: deps.userProfileRepository,
    workspaceId: session.workspaceId,
    workspaceRepository: deps.workspaceRepository,
  });
  const shouldSend = await tryClaimCallSummaryNotification({ deps, session });

  if (!shouldSend) {
    return;
  }

  await deps.notificationGateway.sendCallSummary({
    channelUpdates,
    ...(overview === null ? {} : { overview }),
    session,
    slackUserId: linkedSlackUser.slackUserId,
    summary,
    workspace,
  });
};

const finalizeSession = async ({
  deps,
  session,
}: {
  readonly deps: CallWorkflowDeps;
  readonly session: CallSession;
}): Promise<void> => {
  const events = await deps.callEventRepository.listByCallSessionId({
    callSessionId: session.id,
    workspaceId: session.workspaceId,
  });
  const summary = getSummary(events);
  const appliedPatchKeys = getAppliedPatchKeys(events);
  const patches = getIncomingPatches(events).filter(
    (patch) => !appliedPatchKeys.has(getPatchKey(patch))
  );
  const drafts = getIncomingFollowUpDrafts(events);
  const workTaskDrafts = getIncomingWorkTaskDrafts(events);

  const updatedTasks = await applyApprovedPatches({ deps, patches, session });
  const createdFollowUpTasks = await Promise.all(
    drafts.map((draft) => createApprovedFollowUpTask({ deps, draft, session }))
  );
  const createdWorkTasks = await Promise.all(
    workTaskDrafts.map((draft) =>
      createApprovedWorkTask({ deps, draft, session })
    )
  );
  const createdTasks = [...createdFollowUpTasks, ...createdWorkTasks].filter(
    isCreatedTask
  );

  await notifyTasksCreatedFromCallBestEffort({
    deps,
    session,
    tasks: createdTasks,
  });

  await applyLatestInfoDraftsFromCallBestEffort({ deps, events, session });
  const channelUpdates = await applyChannelReviewDraftsFromCallBestEffort({
    deps,
    events,
    session,
  });
  await applyChannelBlockDraftsFromCallBestEffort({ deps, events, session });
  await sendFollowUpAnswers({
    answeredFollowUpTaskIds: getAnsweredFollowUpTaskIds(patches),
    deps,
    session,
    tasks: updatedTasks,
  });
  const overview = await composeCallOverviewBestEffort({
    channelUpdates,
    createdTasks,
    deps,
    session,
    updatedTasks,
  });
  await sendCallSummary({ channelUpdates, deps, overview, session, summary });
  await updateSessionSummary({ deps, session, summary });
};

export const finalizeEndedCalls = async ({
  deps,
}: {
  readonly deps: CallWorkflowDeps;
}): Promise<void> => {
  const sessions = await deps.callSessionRepository.listEndedWithoutSummary();

  await Promise.all(
    sessions.map((session) => finalizeSession({ deps, session }))
  );
};
