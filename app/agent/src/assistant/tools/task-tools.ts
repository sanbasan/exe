/* eslint-disable max-lines -- Assistant plain task tools are kept together so tool behavior is reviewed in one place. */
import type { PlainToolSet } from '#agent/assistant/plain-tool';
import type { ChannelToolComposition } from '#agent/assistant/tools/channel-tools';
import type { CallDataRoom } from '#agent/data-channel';
import type { DraftKind, DraftRegistry } from '#agent/draft-registry';
import {
  type CallEventRecorderComposition,
  recordFollowUpDraftProposal,
  recordPatchProposal,
  recordWorkTaskDraftProposal,
} from '#agent/tool-proposals';
import {
  type Channel,
  followUpTaskDraftSchema,
  getTaskPatchSnapshot,
  isFollowUpTask,
  isWorkTask,
  taskPatchSchema,
  type CallAgenda,
  type Task,
  type TaskPatch,
  workTaskDraftSchema,
  type WorkTask,
} from '@exe/domain';
import type { ComposedWorkTaskPatch, ServerComposition } from '@exe/server';
import { z } from 'zod';

const TASK_ID_DESCRIPTION =
  'Exact task ID from the task list. Do not use the task title, list number, or user-facing name.';
const SOURCE_TASK_ID_DESCRIPTION =
  'Exact task ID from the task list when the new follow-up came from an existing task.';
const FOLLOW_UP_ASSIGNEE_ERROR =
  'Follow-up task draft was not recorded because assigneeSlackUserIds was missing or empty. For a new follow-up task, ask who should answer it, then call this tool again with one or more assigneeSlackUserIds. Do not pass [] to mean "unspecified".';
const WORK_TASK_ASSIGNEE_ERROR =
  'Work task draft was not recorded because assigneeSlackUserIds was missing or empty. Ask who should own the task, then call this tool again with one or more assigneeSlackUserIds. Do not pass [] to mean "unspecified".';
const REVISABLE_DRAFT_ERROR =
  'No revisable pending draft with that draft ID was found for this tool. Call list_pending_drafts to check the ID, or omit draftId to record a new draft.';
const DRAFT_ID_DESCRIPTION =
  'Pass the draft ID returned earlier in this conversation (e.g. "d2") to REVISE that pending draft instead of recording another one. Omit to record a new draft. When revising, pass the complete new values, not only the changed fields.';

const workTaskPatchParametersSchema = z
  .object({
    draftId: z.string().min(1).optional().describe(DRAFT_ID_DESCRIPTION),
    dueAt: z
      .string()
      .min(1)
      .optional()
      .describe(
        'New due date/time as ISO 8601, or the literal string "none" to REMOVE the due date entirely. If the user only gives a local date, use the end of that local day in the agenda timezone.'
      ),
    reasonHint: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'A few words pointing at the reason the user gave for the change, e.g. "クライアント確認待ちのため". Do NOT write the full sentence here; a prose composer records the full reason from the transcript.'
      ),
    status: z.enum(['active', 'blocked', 'cancelled', 'completed']).optional(),
    taskId: z.string().min(1).describe(TASK_ID_DESCRIPTION),
    titleHint: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Pass ONLY when the user asked to rename the task: a few words pointing at the new title. Do NOT write the full title here; a prose composer composes it from the transcript.'
      ),
  })
  .strict();

const followUpAnswerParametersSchema = z
  .object({
    draftId: z.string().min(1).optional().describe(DRAFT_ID_DESCRIPTION),
    hint: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Optional few words pointing at which part of the conversation is the answer; a prose composer extracts the actual answer from the transcript.'
      ),
    taskId: z.string().min(1).describe(TASK_ID_DESCRIPTION),
  })
  .strict();

const followUpDraftParametersSchema = z
  .object({
    assigneeSlackUserIds: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'Slack user IDs for the people who should answer this new follow-up task. Required for new follow-up tasks. If the assignee is unknown, ask a clarification before calling this tool. Never pass [] to mean "unspecified".'
      ),
    channelId: z.string().min(1).optional(),
    draftId: z.string().min(1).optional().describe(DRAFT_ID_DESCRIPTION),
    hint: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'A few words in the workspace language pointing at what should be confirmed with whom; NOT the final title or question — a prose composer composes them from the call transcript.'
      ),
    sourceTaskId: z
      .string()
      .min(1)
      .describe(SOURCE_TASK_ID_DESCRIPTION)
      .optional(),
  })
  .strict();

const workTaskDraftParametersSchema = z
  .object({
    assigneeSlackUserIds: z
      .array(z.string().min(1))
      .describe(
        'Slack user IDs for the people who should own this new work task. Required. If the assignee is unknown, ask a clarification before calling this tool. Never pass [] to mean "unspecified".'
      ),
    channelName: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Slack channel name, without needing a leading #. Use this when the task belongs to a known channel.'
      ),
    draftId: z.string().min(1).optional().describe(DRAFT_ID_DESCRIPTION),
    dueAt: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional due date/time as ISO 8601. If the user only gives a local date, use the end of that local day in the agenda timezone.'
      ),
    hint: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'A few words in the workspace language pointing at which task the user asked for, e.g. "API仕様書のレビュー". Do NOT write the final title or full sentences here; a prose composer composes the title from the call transcript.'
      ),
  })
  .strict();

const unrelatedWorkTaskLookupParametersSchema = z
  .object({
    channelName: z
      .string()
      .min(1)
      .optional()
      .describe('Optional Slack channel name to limit the lookup.'),
  })
  .strict();

const channelParticipantsParametersSchema = z
  .object({
    channelName: z.string().min(1),
  })
  .strict();

type FollowUpDraftToolArgs = z.infer<typeof followUpDraftParametersSchema>;
type WorkTaskDraftToolArgs = z.infer<typeof workTaskDraftParametersSchema>;
type WorkTaskPatchToolArgs = z.infer<typeof workTaskPatchParametersSchema>;
type TaskToolComposition = CallEventRecorderComposition &
  ChannelToolComposition & {
    readonly services: {
      readonly proseComposer: Pick<
        ServerComposition['services']['proseComposer'],
        | 'composeFollowUpAnswer'
        | 'composeFollowUpTask'
        | 'composeWorkTaskPatch'
        | 'composeWorkTaskTitle'
      >;
    };
  };

const normalizeChannelName = (name: string): string =>
  name.trim().replace(/^#/u, '').toLowerCase();

const findChannelByName = ({
  channelName,
  channels,
}: {
  readonly channelName: string;
  readonly channels: readonly Channel[];
}): Channel | null => {
  const target = normalizeChannelName(channelName);

  return (
    channels.find((channel) => normalizeChannelName(channel.name) === target) ??
    null
  );
};

// Every task list the prompt can show a task ID from must be searchable here;
// otherwise the agent gets "No matching work task" for an ID it was shown and
// concludes the capability itself is missing.
const findAgendaTask = ({
  agenda,
  taskId,
}: {
  readonly agenda: CallAgenda;
  readonly taskId: string;
}): Task | null =>
  [
    ...agenda.workTasks,
    ...agenda.requestedWorkTasks,
    ...agenda.followUpTasks,
    ...agenda.channelOpenWorkTasks.flatMap((item) => item.openWorkTasks),
    ...agenda.channelReviews.flatMap((item) => [
      ...item.assignedWorkTasks,
      ...item.requestedWorkTasks,
      ...item.otherActiveWorkTasks,
      ...item.completedWorkTasksSinceLastCheck,
    ]),
  ].find((task) => task.id === taskId) ?? null;

const hasWorkTaskPatchChange = (
  args: z.infer<typeof workTaskPatchParametersSchema>
): boolean =>
  args.dueAt !== undefined ||
  args.status !== undefined ||
  args.titleHint !== undefined;

const buildFollowUpAnswerPatch = ({
  agenda,
  answer,
  taskId,
}: {
  readonly agenda: CallAgenda;
  readonly answer: string;
  readonly taskId: string;
}): TaskPatch | null => {
  const task = findAgendaTask({ agenda, taskId });

  if (task === null || !isFollowUpTask(task)) {
    return null;
  }

  return taskPatchSchema.parse({
    after: {
      followUpAnswer: answer,
      kind: 'follow_up',
      status: 'completed',
    },
    before: getTaskPatchSnapshot(task),
    taskId: task.id,
  });
};

const hasFollowUpDraftAssignees = ({
  assigneeSlackUserIds,
}: FollowUpDraftToolArgs): boolean =>
  assigneeSlackUserIds !== undefined && assigneeSlackUserIds.length > 0;

const hasWorkTaskDraftAssignees = ({
  assigneeSlackUserIds,
}: WorkTaskDraftToolArgs): boolean => assigneeSlackUserIds.length > 0;

const formatWorkTaskForTool = (task: WorkTask): Record<string, unknown> => ({
  assigneeSlackUserIds: task.assigneeSlackUserIds,
  ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
  createdAt: task.createdAt,
  ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
  requesterSlackUserIds: task.requesterSlackUserIds,
  status: task.status,
  taskId: task.id,
  title: task.title,
});

const getUnrelatedOpenWorkTasks = ({
  agenda,
  channelName,
}: {
  readonly agenda: CallAgenda;
  readonly channelName?: string;
}): readonly WorkTask[] => {
  const channel =
    channelName === undefined
      ? null
      : findChannelByName({ channelName, channels: agenda.channels });

  if (channelName !== undefined && channel === null) {
    return [];
  }

  return agenda.channelOpenWorkTasks
    .filter((item) =>
      channel === null ? true : item.channel.channelId === channel.channelId
    )
    .flatMap((item) => item.openWorkTasks)
    .filter(
      (task) =>
        !task.assigneeSlackUserIds.includes(agenda.slackUserId) &&
        !task.requesterSlackUserIds.includes(agenda.slackUserId)
    );
};

const uniqueStrings = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

// Returns the draft ID to record under (registering a composing placeholder
// for new drafts), or null when the passed draftId does not refer to a
// revisable pending draft of the expected kind. isNew tells failure handling
// whether the draft can be marked failed or must keep its previous content.
const claimProposalDraftId = ({
  draftId,
  kind,
  registry,
}: {
  readonly draftId?: string;
  readonly kind: DraftKind;
  readonly registry: DraftRegistry;
}): { readonly draftId: string; readonly isNew: boolean } | null => {
  if (draftId === undefined) {
    return {
      draftId: registry.register({
        detail: {},
        kind,
        status: 'composing',
        summary: '(composing)',
      }),
      isNew: true,
    };
  }

  const existing = registry.get(draftId);

  return existing !== null &&
    existing.kind === kind &&
    existing.status === 'pending'
    ? { draftId, isNew: false }
    : null;
};

// "none" is the tool-level sentinel for removing the due date; the domain
// patch expresses removal as dueAt: null.
const buildDueAtChange = (dueAt?: string): string | null | undefined =>
  dueAt === undefined ? undefined : dueAt === 'none' ? null : dueAt;

const buildWorkTaskChangeSummary = (args: WorkTaskPatchToolArgs): string =>
  [
    ...(args.dueAt === undefined ? [] : [`dueAt → ${args.dueAt}`]),
    ...(args.status === undefined ? [] : [`status → ${args.status}`]),
    ...(args.titleHint === undefined
      ? []
      : [`retitle requested (${args.titleHint})`]),
  ].join(', ');

const composeWorkTaskPatchProse = ({
  agenda,
  args,
  changeSummary,
  composition,
  sessionId,
  task,
  workspaceId,
}: {
  readonly agenda: CallAgenda;
  readonly args: WorkTaskPatchToolArgs;
  readonly changeSummary: string;
  readonly composition: TaskToolComposition;
  readonly sessionId: string;
  readonly task: Task;
  readonly workspaceId: string;
}): Promise<ComposedWorkTaskPatch | null> =>
  composition.services.proseComposer.composeWorkTaskPatch({
    callSessionId: sessionId,
    changeSummary,
    ...(args.reasonHint === undefined ? {} : { hint: args.reasonHint }),
    ...(agenda.speakerName === undefined
      ? {}
      : { speakerName: agenda.speakerName }),
    taskTitle: task.title,
    ...(args.titleHint === undefined ? {} : { titleHint: args.titleHint }),
    workspaceId,
  });

const buildWorkTaskPatch = ({
  args,
  draftId,
  reason,
  task,
  title,
}: {
  readonly args: WorkTaskPatchToolArgs;
  readonly draftId: string;
  readonly reason?: string;
  readonly task: Task;
  readonly title?: string;
}): TaskPatch => {
  const dueAtChange = buildDueAtChange(args.dueAt);

  return taskPatchSchema.parse({
    after: {
      ...(dueAtChange === undefined ? {} : { dueAt: dueAtChange }),
      ...(args.status === undefined ? {} : { status: args.status }),
      ...(title === undefined ? {} : { title }),
      kind: 'work',
    },
    before: getTaskPatchSnapshot(task),
    draftId,
    ...(reason === undefined ? {} : { reason }),
    taskId: task.id,
  });
};

// Composes, builds, and records the patch; returns null when the change could
// not be composed (so the caller marks the draft failed), otherwise the patch
// plus the user-facing result string.
const runWorkTaskPatchProposal = async ({
  agenda,
  args,
  composition,
  draftId,
  room,
  sessionId,
  task,
  topic,
  workspaceId,
}: {
  readonly agenda: CallAgenda;
  readonly args: WorkTaskPatchToolArgs;
  readonly composition: TaskToolComposition;
  readonly draftId: string;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly task: Task;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<{ readonly patch: TaskPatch; readonly result: string } | null> => {
  const changeSummary = buildWorkTaskChangeSummary(args);
  const composed = await composeWorkTaskPatchProse({
    agenda,
    args,
    changeSummary,
    composition,
    sessionId,
    task,
    workspaceId,
  });

  if (composed === null) {
    return null;
  }

  const title = args.titleHint === undefined ? undefined : composed.title;

  if (
    args.dueAt === undefined &&
    args.status === undefined &&
    title === undefined
  ) {
    return null;
  }

  const patch = buildWorkTaskPatch({
    args,
    draftId,
    ...(composed.reason === undefined ? {} : { reason: composed.reason }),
    task,
    ...(title === undefined ? {} : { title }),
  });

  await recordPatchProposal({
    composition,
    patch,
    room,
    sessionId,
    topic,
    workspaceId,
  });

  return {
    patch,
    result: `Task update recorded for "${task.title}" (draft ${draftId}): ${changeSummary}${
      title === undefined ? '' : `; new title "${title}"`
    }${
      composed.reason === undefined ? '' : `; reason: ${composed.reason}`
    }. It will be applied automatically after the call.`,
  };
};

export const buildAssistantTaskTools = ({
  agenda,
  composition,
  registry,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly agenda: CallAgenda;
  readonly composition: TaskToolComposition;
  readonly registry: DraftRegistry;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): PlainToolSet => ({
  get_channel_participants: {
    description:
      'Get Slack user IDs participating in a known active channel. Use this before creating a task or follow-up when the user refers to someone by channel context and you need the possible account IDs. The result includes channel owners, watchers, creator, and people appearing on open tasks that were preloaded for this channel.',
    execute: (rawArgs): Promise<string> => {
      const args = channelParticipantsParametersSchema.parse(rawArgs);
      const channel = findChannelByName({
        channelName: args.channelName,
        channels: agenda.channels,
      });

      if (channel === null) {
        return Promise.resolve(
          'No matching channel was found. Ask the user to confirm the channel name.'
        );
      }

      const openTasks =
        agenda.channelOpenWorkTasks.find(
          (item) => item.channel.channelId === channel.channelId
        )?.openWorkTasks ?? [];

      return Promise.resolve(
        JSON.stringify({
          channel: {
            channelId: channel.channelId,
            name: channel.name,
          },
          creatorSlackUserId: channel.createdBySlackUserId,
          ownerSlackUserIds: channel.assigneeSlackUserIds,
          taskParticipantSlackUserIds: uniqueStrings(
            openTasks.flatMap((task) => [
              ...task.assigneeSlackUserIds,
              ...task.requesterSlackUserIds,
            ])
          ),
          watcherSlackUserIds: channel.watcherSlackUserIds,
        })
      );
    },
    parameters: channelParticipantsParametersSchema,
  },
  get_unrelated_open_work_tasks: {
    description:
      'Get open work tasks in preloaded channel task lists where the current user is neither an assignee nor a requester. Use this only when the user asks about tasks they are not personally involved in, or when channel context requires seeing everyone else’s open work. Optionally limit by channelName.',
    execute: (rawArgs): Promise<string> => {
      const args = unrelatedWorkTaskLookupParametersSchema.parse(rawArgs);
      const tasks = getUnrelatedOpenWorkTasks({
        agenda,
        ...(args.channelName === undefined
          ? {}
          : { channelName: args.channelName }),
      });

      return Promise.resolve(
        tasks.length === 0
          ? 'No unrelated open work tasks were found.'
          : JSON.stringify(tasks.map(formatWorkTaskForTool))
      );
    },
    parameters: unrelatedWorkTaskLookupParametersSchema,
  },
  propose_follow_up_answer: {
    description:
      'Record an answer for an existing follow-up task after the user answers it. Pass the exact task ID shown for that task in the Follow-up Tasks list as taskId (the user refers to it by name, never by ID), and optionally a short hint pointing at which part of the conversation is the answer — a short hint, not the final text; a prose composer reads the call transcript and extracts the actual answer. The recorded answer is applied automatically after the call. Pass draftId to revise an existing pending draft instead of recording another; when revising, pass the complete new values.',
    execute: async (rawArgs): Promise<string> => {
      const args = followUpAnswerParametersSchema.parse(rawArgs);
      const task = findAgendaTask({ agenda, taskId: args.taskId });

      if (task === null || !isFollowUpTask(task)) {
        return 'No matching follow-up task was found.';
      }

      const claimed = claimProposalDraftId({
        ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
        kind: 'task_patch',
        registry,
      });

      if (claimed === null) {
        return REVISABLE_DRAFT_ERROR;
      }

      const { draftId, isNew } = claimed;
      const markFailed = (): void => {
        if (isNew) {
          registry.update({ changes: { status: 'failed' }, draftId });
        }
      };
      const composed =
        await composition.services.proseComposer.composeFollowUpAnswer({
          callSessionId: sessionId,
          followUpQuestion: task.followUpQuestion,
          ...(args.hint === undefined ? {} : { hint: args.hint }),
          ...(agenda.speakerName === undefined
            ? {}
            : { speakerName: agenda.speakerName }),
          taskTitle: task.title,
          workspaceId,
        });

      if (composed === null) {
        markFailed();

        return 'The follow-up answer could not be composed from the conversation so far. Include a more specific hint or report back that the user must restate the answer.';
      }

      const basePatch = buildFollowUpAnswerPatch({
        agenda,
        answer: composed.answer,
        taskId: args.taskId,
      });

      if (basePatch === null) {
        markFailed();

        return 'The follow-up answer could not be composed from the conversation so far. Include a more specific hint or report back that the user must restate the answer.';
      }

      const patch: TaskPatch = { ...basePatch, draftId };

      await recordPatchProposal({
        composition,
        patch,
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: patch,
          status: 'pending',
          summary: `Follow-up answer for task ${args.taskId}`,
        },
        draftId,
      });

      return `Follow-up answer recorded for "${task.title}" (draft ${draftId}): ${composed.answer} — it will be applied automatically after the call.`;
    },
    parameters: followUpAnswerParametersSchema,
  },
  propose_follow_up_task: {
    description:
      'Record a new follow-up task when the user asks to confirm something with another person. This is a create operation, not a partial update: assigneeSlackUserIds is required and must contain the target person or people; never pass [] or omit it — ask a clarification instead. Pass only a short hint for what should be confirmed with whom — a short hint, not the final title or question; a prose composer reads the call transcript and composes them. Ask a clarification first if the target person or channel context is ambiguous. The recorded draft is applied automatically after the call. Pass draftId to revise an existing pending draft; when revising, pass the complete new values.',
    execute: async (rawArgs): Promise<string> => {
      const args = followUpDraftParametersSchema.parse(rawArgs);

      if (!hasFollowUpDraftAssignees(args)) {
        return FOLLOW_UP_ASSIGNEE_ERROR;
      }

      const claimed = claimProposalDraftId({
        ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
        kind: 'follow_up_task',
        registry,
      });

      if (claimed === null) {
        return REVISABLE_DRAFT_ERROR;
      }

      const { draftId, isNew } = claimed;
      const markFailed = (): void => {
        if (isNew) {
          registry.update({ changes: { status: 'failed' }, draftId });
        }
      };
      const composed =
        await composition.services.proseComposer.composeFollowUpTask({
          callSessionId: sessionId,
          hint: args.hint,
          ...(agenda.speakerName === undefined
            ? {}
            : { speakerName: agenda.speakerName }),
          workspaceId,
        });

      if (composed === null) {
        markFailed();

        return 'The follow-up task could not be composed from the conversation so far. Include a more specific hint or report back that the user must restate what should be confirmed.';
      }

      const draft = followUpTaskDraftSchema.parse({
        assigneeSlackUserIds: args.assigneeSlackUserIds,
        ...(args.channelId === undefined ? {} : { channelId: args.channelId }),
        ...(args.sourceTaskId === undefined
          ? {}
          : { sourceTaskId: args.sourceTaskId }),
        draftId,
        followUpQuestion: composed.followUpQuestion,
        requesterSlackUserIds: [agenda.slackUserId],
        title: composed.title,
      });

      await recordFollowUpDraftProposal({
        composition,
        draft,
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: draft,
          status: 'pending',
          summary: `New follow-up task "${draft.title}"`,
        },
        draftId,
      });

      return `Follow-up task recorded (draft ${draftId}): "${composed.title}" — follow-up question: ${composed.followUpQuestion}. It will be applied automatically after the call.`;
    },
    parameters: followUpDraftParametersSchema,
  },
  propose_work_task: {
    description:
      'Record a new work task after the user asks to create a task. This is a create operation, not an update: assigneeSlackUserIds is required and must contain the owner or owners; never pass [] — ask a clarification instead. If the task belongs to a channel, pass channelName so it can be attached. Pass only a short hint for what the task is — a short hint, not the final title; a prose composer reads the call transcript and composes the title. The recorded draft is applied automatically after the call. Pass draftId to revise an existing pending draft; when revising, pass the complete new values.',
    execute: async (rawArgs): Promise<string> => {
      const args = workTaskDraftParametersSchema.parse(rawArgs);

      if (!hasWorkTaskDraftAssignees(args)) {
        return WORK_TASK_ASSIGNEE_ERROR;
      }

      const channel =
        args.channelName === undefined
          ? null
          : findChannelByName({
              channelName: args.channelName,
              channels: agenda.channels,
            });

      if (args.channelName !== undefined && channel === null) {
        return 'No matching channel was found. Ask the user to confirm the channel name.';
      }

      const claimed = claimProposalDraftId({
        ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
        kind: 'work_task',
        registry,
      });

      if (claimed === null) {
        return REVISABLE_DRAFT_ERROR;
      }

      const { draftId, isNew } = claimed;
      const markFailed = (): void => {
        if (isNew) {
          registry.update({ changes: { status: 'failed' }, draftId });
        }
      };
      const composed =
        await composition.services.proseComposer.composeWorkTaskTitle({
          callSessionId: sessionId,
          hint: args.hint,
          ...(agenda.speakerName === undefined
            ? {}
            : { speakerName: agenda.speakerName }),
          workspaceId,
        });

      if (composed === null) {
        markFailed();

        return 'The work task could not be composed from the conversation so far. Include a more specific hint or report back that the user must restate the task.';
      }

      const draft = workTaskDraftSchema.parse({
        assigneeSlackUserIds: args.assigneeSlackUserIds,
        ...(channel === null ? {} : { channelId: channel.channelId }),
        draftId,
        ...(args.dueAt === undefined ? {} : { dueAt: args.dueAt }),
        requesterSlackUserIds: [agenda.slackUserId],
        title: composed.title,
      });

      await recordWorkTaskDraftProposal({
        composition,
        draft,
        room,
        sessionId,
        topic,
        workspaceId,
      });
      registry.update({
        changes: {
          detail: draft,
          status: 'pending',
          summary: `New work task "${draft.title}"`,
        },
        draftId,
      });

      return `Work task recorded (draft ${draftId}): "${composed.title}". It will be applied automatically after the call.`;
    },
    parameters: workTaskDraftParametersSchema,
  },
  propose_work_task_patch: {
    description:
      'Record updates to an existing work task after the user states a concrete change. Pass the exact task ID shown for that task in the Work Tasks list as taskId (the user refers to it by name, never by ID), plus the structured change (dueAt, status) and, when renaming, a short titleHint. Pass dueAt "none" to remove the due date entirely. For a change spanning several tasks, call this once per task. When recording a due-date change, pass a short reasonHint pointing at the reason the user gave — a short hint, not the full sentence; a prose composer reads the call transcript and records the full reason. The recorded change is applied automatically after the call. Pass draftId to revise an existing pending draft; when revising, pass the complete new values.',
    execute: async (rawArgs): Promise<string> => {
      const args = workTaskPatchParametersSchema.parse(rawArgs);
      const task = findAgendaTask({ agenda, taskId: args.taskId });

      if (task === null || !isWorkTask(task) || !hasWorkTaskPatchChange(args)) {
        return 'No matching work task or changed field was found.';
      }

      const claimed = claimProposalDraftId({
        ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
        kind: 'task_patch',
        registry,
      });

      if (claimed === null) {
        return REVISABLE_DRAFT_ERROR;
      }

      const { draftId, isNew } = claimed;
      const outcome = await runWorkTaskPatchProposal({
        agenda,
        args,
        composition,
        draftId,
        room,
        sessionId,
        task,
        topic,
        workspaceId,
      });

      if (outcome === null) {
        if (isNew) {
          registry.update({ changes: { status: 'failed' }, draftId });
        }

        return 'The task update could not be composed from the conversation so far. Include a more specific hint or report back that the user must restate the change.';
      }

      registry.update({
        changes: {
          detail: outcome.patch,
          status: 'pending',
          summary: `Update to work task ${args.taskId}`,
        },
        draftId,
      });

      return outcome.result;
    },
    parameters: workTaskPatchParametersSchema,
  },
});
