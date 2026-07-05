import { buildCallTranscript } from '#server/services/call-transcript';
import { withSlackBotToken } from '#server/services/slack-bot-token';
import {
  buildTaskPageMarkdown,
  taskPageSlug,
} from '#server/services/task-gbrain';
import type { CallWorkflowDeps } from './deps';
import {
  isWorkTask,
  workTaskSchema,
  type CallSession,
  type Task,
  type Workspace,
  type WorkTask,
} from '@exe/domain';
import {
  buildTaskHandoffNoteBlocks,
  buildTaskHandoffNoteFallbackText,
} from '@exe/slack';

// Handover documents ("引き継ぎ書") for AI-initiated reassignments. Composed
// after a call whenever an applied patch moved a task to different assignees
// (or the task already carries a note — successive calls answer its open
// questions), from the call transcript + GBrain findings about the task.

const sameMembers = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((member) => right.includes(member));

const shouldComposeHandoff = ({
  previousTask,
  task,
}: {
  readonly previousTask: Task;
  readonly task: Task;
}): boolean => {
  if (!isWorkTask(task) || !isWorkTask(previousTask)) {
    return false;
  }

  const reassigned = !sameMembers(
    previousTask.assigneeSlackUserIds,
    task.assigneeSlackUserIds
  );

  return reassigned || task.handoffNote !== undefined;
};

const mention = (slackUserId: string): string => `<@${slackUserId}>`;

const fetchGBrainFindings = async ({
  deps,
  task,
  workspaceId,
}: {
  readonly deps: CallWorkflowDeps;
  readonly task: WorkTask;
  readonly workspaceId: string;
}): Promise<readonly string[]> => {
  if (!deps.gbrainQueryGateway.isEnabled()) {
    return [];
  }

  const results = await deps.gbrainQueryGateway
    .query({ limit: 5, query: task.title, workspaceId })
    .catch((): readonly never[] => []);

  return results.flatMap((result) =>
    result.chunkText === undefined
      ? [result.slug]
      : [`${result.slug}: ${result.chunkText}`]
  );
};

const postHandoffNoteToThreadBestEffort = async ({
  deps,
  note,
  task,
  workspace,
}: {
  readonly deps: CallWorkflowDeps;
  readonly note: string;
  readonly task: WorkTask;
  readonly workspace: Workspace;
}): Promise<void> => {
  const channelId = task.channelId;

  if (channelId === undefined) {
    return;
  }

  const threadTs = task.threadTs ?? task.messageTs;

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: async ({ botToken }): Promise<void> => {
      await deps.slackGateway.postMessage({
        blocks: buildTaskHandoffNoteBlocks({
          language: workspace.language,
          note,
          taskTitle: task.title,
        }),
        botToken,
        channelId,
        text: buildTaskHandoffNoteFallbackText({
          language: workspace.language,
          taskTitle: task.title,
        }),
        ...(threadTs === undefined ? {} : { threadTs }),
        unfurlLinks: false,
      });
    },
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  }).catch(
    (error: unknown): Promise<void> =>
      deps.errorReporter.report({
        context: { route: 'workflows/handoff-slack' },
        error,
      })
  );
};

const ingestHandoffToGBrainBestEffort = async ({
  deps,
  task,
  workspace,
}: {
  readonly deps: CallWorkflowDeps;
  readonly task: WorkTask;
  readonly workspace: Workspace;
}): Promise<void> => {
  if (!deps.gbrainIngestGateway.isEnabled()) {
    return;
  }

  const allTasks = await deps.taskRepository
    .listByWorkspace({ workspaceId: workspace.id })
    .catch((): readonly Task[] => []);
  const tasksById = new Map(allTasks.map((entry) => [entry.id, entry]));

  await deps.gbrainIngestGateway
    .ingestPage({
      markdown: buildTaskPageMarkdown({ task, tasksById }),
      slug: taskPageSlug(task.id),
      workspaceId: workspace.id,
    })
    .catch(
      (error: unknown): Promise<void> =>
        deps.errorReporter.report({
          context: { route: 'workflows/handoff-gbrain' },
          error,
        })
    );
};

// Best-effort: a failed handover note never fails the post-call apply.
export const composeHandoffForPatchBestEffort = async ({
  deps,
  previousTask,
  session,
  task,
}: {
  readonly deps: CallWorkflowDeps;
  readonly previousTask: Task;
  readonly session: CallSession;
  readonly task: Task;
}): Promise<void> => {
  if (
    !shouldComposeHandoff({ previousTask, task }) ||
    !isWorkTask(task) ||
    !isWorkTask(previousTask)
  ) {
    return;
  }

  const run = async (): Promise<void> => {
    const [events, workspace] = await Promise.all([
      deps.callEventRepository.listByCallSessionId({
        callSessionId: session.id,
        workspaceId: session.workspaceId,
      }),
      deps.workspaceRepository.getById({ workspaceId: session.workspaceId }),
    ]);

    if (workspace === null) {
      return;
    }

    const transcript = buildCallTranscript({ events });
    const gbrainFindings = await fetchGBrainFindings({
      deps,
      task,
      workspaceId: workspace.id,
    });
    const note = await deps.handoffComposer.composeHandoffNote({
      fromDisplayNames: previousTask.assigneeSlackUserIds.map(mention),
      gbrainFindings,
      language: workspace.language,
      ...(task.handoffNote === undefined
        ? {}
        : { previousNote: task.handoffNote }),
      task,
      toDisplayNames: task.assigneeSlackUserIds.map(mention),
      transcript,
    });

    if (note === null) {
      return;
    }

    const withNote = workTaskSchema.parse({
      ...task,
      handoffNote: note,
      updatedAt: deps.clock.now(),
    });

    await deps.taskRepository.update({ task: withNote });
    await postHandoffNoteToThreadBestEffort({
      deps,
      note,
      task: withNote,
      workspace,
    });
    await ingestHandoffToGBrainBestEffort({
      deps,
      task: withNote,
      workspace,
    });
  };

  await run().catch(
    (error: unknown): Promise<void> =>
      deps.errorReporter.report({
        context: { route: 'workflows/handoff-compose' },
        error,
      })
  );
};
