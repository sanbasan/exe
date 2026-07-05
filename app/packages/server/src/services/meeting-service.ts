/* eslint-disable max-lines -- Meeting service owns the whole recording pipeline as one linear flow. */
import { notFoundError } from '#server/errors';
import type { GBrainIngestGateway } from '#server/gateways';
import type {
  ChannelRepository,
  Clock,
  IdGenerator,
  MeetingRepository,
  NotificationGateway,
  SlackGateway,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import { reportServerError } from '#server/utils';
import { getWorkspaceForUser } from '#server/workspace-access';
import type {
  MeetingChannelContext,
  MeetingComposer,
  MeetingExtraction,
  MeetingMemberContext,
} from './meeting-composer';
import { withSlackBotToken } from './slack-bot-token';
import { ingestTaskPagesBestEffort, taskPageSlug } from './task-gbrain';
import type { TaskGraphService } from './task-graph-service';
import {
  applyTaskPatch,
  createWorkTaskFromDraft,
  isWorkTask,
  meetingSchema,
  taskPatchSchema,
  workTaskSchema,
  type Meeting,
  type SlackWorkspaceMember,
  type Task,
  type Workspace,
  type WorkTask,
} from '@exe/domain';

export interface MeetingService {
  readonly createForUser: (params: {
    readonly channelId?: string;
    readonly durationSeconds?: number;
    readonly participantSlackUserIds?: readonly string[];
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Meeting>;
  readonly getForUser: (params: {
    readonly meetingId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<Meeting>;
  readonly listForUser: (params: {
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly Meeting[]>;
  // Heavy post-upload pipeline; run after the create response is sent. Never
  // rejects: failures land on the meeting document as status 'failed'.
  readonly process: (params: {
    readonly audioBase64: string;
    readonly meetingId: string;
    readonly mimeType: string;
    readonly workspaceId: string;
  }) => Promise<void>;
}

interface AppliedMeetingDependency {
  readonly blockedTaskId: string;
  readonly blockerTaskId: string;
}

interface CreatedMeetingTask {
  readonly ref: string;
  readonly task: WorkTask;
}

const firstNonEmpty = (
  ...values: readonly (string | null | undefined)[]
): string =>
  values.find(
    (value): value is string => typeof value === 'string' && value.length > 0
  ) ?? 'unknown';

const memberDisplayName = (member: SlackWorkspaceMember): string =>
  firstNonEmpty(
    member.profile?.display_name,
    member.real_name,
    member.name,
    member.id
  );

const bulletSection = ({
  heading,
  items,
}: {
  readonly heading: string;
  readonly items: readonly string[];
}): readonly string[] =>
  items.length === 0
    ? []
    : ['', `## ${heading}`, '', ...items.map((item) => `- ${item}`)];

const buildMeetingPageMarkdown = ({
  meeting,
  tasks,
}: {
  readonly meeting: Meeting;
  readonly tasks: readonly WorkTask[];
}): string => {
  const title = meeting.title ?? meeting.id;
  const overview = meeting.notes?.overview;
  const lines = [
    '---',
    'type: meeting',
    `title: ${JSON.stringify(title)}`,
    'source: exe-recording',
    `recorded_at: ${meeting.createdAt}`,
    ...(meeting.channelId === undefined
      ? []
      : [`channel: ${meeting.channelId}`]),
    '---',
    '',
    `# ${title}`,
    ...(overview === undefined ? [] : ['', '## Overview', '', overview]),
    ...bulletSection({
      heading: 'Key points',
      items: meeting.notes?.keyPoints ?? [],
    }),
    ...bulletSection({
      heading: 'Decisions',
      items: meeting.notes?.decisions ?? [],
    }),
    ...bulletSection({
      heading: 'Tasks',
      items: tasks.map(
        (task) => `${task.title} ([[${taskPageSlug(task.id)}]])`
      ),
    }),
    ...(meeting.transcript === undefined
      ? []
      : ['', '## Transcript', '', meeting.transcript]),
  ];

  return lines.join('\n');
};

export const createMeetingService = ({
  channelRepository,
  clock,
  encryptionKey,
  gbrainIngestGateway,
  idGenerator,
  meetingComposer,
  meetingRepository,
  notificationGateway,
  slackGateway,
  taskGraph,
  taskRepository,
  userProfileRepository,
  workspaceRepository,
}: {
  readonly channelRepository: ChannelRepository;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly gbrainIngestGateway: GBrainIngestGateway;
  readonly idGenerator: IdGenerator;
  readonly meetingComposer: MeetingComposer;
  readonly meetingRepository: MeetingRepository;
  readonly notificationGateway: NotificationGateway;
  readonly slackGateway: SlackGateway;
  readonly taskGraph: TaskGraphService;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}): MeetingService => {
  const getWorkspaceOrThrow = async (
    workspaceId: string
  ): Promise<Workspace> => {
    const workspace = await workspaceRepository.getById({ workspaceId });

    if (workspace === null) {
      throw notFoundError('Workspace not found.');
    }

    return workspace;
  };

  const getMeetingOrThrow = async ({
    meetingId,
    workspaceId,
  }: {
    readonly meetingId: string;
    readonly workspaceId: string;
  }): Promise<Meeting> => {
    const meeting = await meetingRepository.getById({ meetingId, workspaceId });

    if (meeting === null) {
      throw notFoundError('Meeting not found.');
    }

    return meeting;
  };

  const updateMeeting = async (meeting: Meeting): Promise<Meeting> => {
    const next = meetingSchema.parse({ ...meeting, updatedAt: clock.now() });

    await meetingRepository.update({ meeting: next });

    return next;
  };

  const listMembersBestEffort = async (
    workspace: Workspace
  ): Promise<readonly MeetingMemberContext[]> => {
    const members = await withSlackBotToken({
      clock,
      ...(encryptionKey === undefined ? {} : { encryptionKey }),
      run: ({ botToken }) => slackGateway.listWorkspaceMembers({ botToken }),
      slackGateway,
      workspace,
      workspaceRepository,
    }).catch((error: unknown) => {
      void reportServerError({
        context: { route: 'meeting/list-members' },
        error,
      });

      return [];
    });

    return members.flatMap((member) => {
      const slackUserId = member.id;

      return typeof slackUserId === 'string' && slackUserId.length > 0
        ? [{ displayName: memberDisplayName(member), slackUserId }]
        : [];
    });
  };

  const resolveRecorderSlackUserId = async ({
    userId,
    workspaceId,
  }: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<string | undefined> => {
    const profile = await userProfileRepository.getById({ userId });

    return profile?.slackUsers.find(
      (linked) => linked.workspaceId === workspaceId
    )?.slackUserId;
  };

  // 1. Create tasks (cards are posted under the meeting anchor below, so
  //    creation here writes documents only). Independent per task.
  const createTasksFromExtraction = ({
    creates,
    meeting,
    now,
    recorderSlackUserId,
    resolvedChannelId,
    workspace,
  }: {
    readonly creates: MeetingExtraction['creates'];
    readonly meeting: Meeting;
    readonly now: string;
    readonly recorderSlackUserId?: string;
    readonly resolvedChannelId?: string;
    readonly workspace: Workspace;
  }): Promise<readonly CreatedMeetingTask[]> =>
    Promise.all(
      creates.map(async (create): Promise<CreatedMeetingTask> => {
        const task = createWorkTaskFromDraft({
          draft: {
            assigneeSlackUserIds: create.assigneeSlackUserIds,
            ...(resolvedChannelId === undefined
              ? {}
              : { channelId: resolvedChannelId }),
            ...(create.description === undefined
              ? {}
              : { description: create.description }),
            ...(create.dueAt === undefined ? {} : { dueAt: create.dueAt }),
            requesterSlackUserIds:
              recorderSlackUserId === undefined ? [] : [recorderSlackUserId],
            title: create.title,
          },
          id: idGenerator.generateId(),
          now,
          sourceMeetingId: meeting.id,
          ...(create.startAt === undefined ? {} : { startAt: create.startAt }),
          workspaceId: workspace.id,
        });

        await taskRepository.create({ task });

        return { ref: create.ref, task };
      })
    );

  // 2. Apply updates to existing tasks. Each update targets a distinct task.
  const applyUpdatesFromExtraction = async ({
    updates,
    workspace,
  }: {
    readonly updates: MeetingExtraction['updates'];
    readonly workspace: Workspace;
  }): Promise<readonly string[]> => {
    const patchedIds = await Promise.all(
      updates.map(async (update): Promise<string | undefined> => {
        const existing = await taskRepository.getById({
          taskId: update.taskId,
          workspaceId: workspace.id,
        });

        if (existing === null || !isWorkTask(existing)) {
          return undefined;
        }

        const patch = taskPatchSchema.parse({
          after: {
            kind: 'work',
            ...(update.assigneeSlackUserIds === undefined
              ? {}
              : { assigneeSlackUserIds: update.assigneeSlackUserIds }),
            ...(update.description === undefined
              ? {}
              : { description: update.description }),
            ...(update.dueAt === undefined ? {} : { dueAt: update.dueAt }),
            ...(update.startAt === undefined
              ? {}
              : { startAt: update.startAt }),
            ...(update.status === undefined ? {} : { status: update.status }),
            ...(update.title === undefined ? {} : { title: update.title }),
          },
          taskId: update.taskId,
        });
        const patched = applyTaskPatch({
          now: clock.now(),
          patch,
          task: existing,
        });

        await taskRepository.update({ task: patched });
        await notificationGateway
          .sendTaskPatchThreadNotice({
            patch,
            previousTask: existing,
            task: patched,
            workspace,
          })
          .catch((error: unknown) => {
            void reportServerError({
              context: { route: 'meeting/patch-notice' },
              error,
            });
          });

        return patched.id;
      })
    );

    return patchedIds.filter((id): id is string => id !== undefined);
  };

  // 3. Post the meeting anchor + task cards, then persist message refs.
  const postMeetingAnchor = async ({
    createdTasks,
    meeting,
    resolvedChannelId,
    workspace,
  }: {
    readonly createdTasks: readonly WorkTask[];
    readonly meeting: Meeting;
    readonly resolvedChannelId: string;
    readonly workspace: Workspace;
  }): Promise<Meeting> => {
    const anchor = await notificationGateway
      .sendMeetingTasksCreated({
        channelId: resolvedChannelId,
        meetingTitle: meeting.title ?? 'Meeting',
        tasks: createdTasks,
        workspace,
      })
      .catch((error: unknown) => {
        void reportServerError({
          context: { route: 'meeting/slack-anchor' },
          error,
        });

        return null;
      });

    if (anchor === null) {
      return meetingSchema.parse({ ...meeting, channelId: resolvedChannelId });
    }

    await Promise.all(
      anchor.taskMessages.map(async (reference): Promise<void> => {
        const task = createdTasks.find(
          (candidate) => candidate.id === reference.taskId
        );

        if (task === undefined) {
          return;
        }

        await taskRepository.update({
          task: workTaskSchema.parse({
            ...task,
            messageTs: reference.messageTs,
            threadTs: reference.threadTs,
          }),
        });
      })
    );

    return meetingSchema.parse({
      ...meeting,
      channelId: resolvedChannelId,
      slackMessageTs: anchor.anchorTs,
      slackThreadTs: anchor.anchorTs,
    });
  };

  // 4. Apply dependency edges (side effects: both task docs, Slack notices
  //    into the meeting thread + task threads, GBrain, blocker call). Kept
  //    sequential: edges can touch shared task documents.
  const applyDependenciesFromExtraction = ({
    dependencies,
    extraSlackTargets,
    resolveTaskId,
    workspace,
  }: {
    readonly dependencies: MeetingExtraction['dependencies'];
    readonly extraSlackTargets: readonly {
      readonly channelId: string;
      readonly threadTs: string;
    }[];
    readonly resolveTaskId: (refOrId: string) => string | undefined;
    readonly workspace: Workspace;
  }): Promise<readonly AppliedMeetingDependency[]> => {
    const applyNext = async (
      remaining: readonly MeetingExtraction['dependencies'][number][],
      applied: readonly AppliedMeetingDependency[]
    ): Promise<readonly AppliedMeetingDependency[]> => {
      const [dependency, ...rest] = remaining;

      if (dependency === undefined) {
        return applied;
      }

      const blockerTaskId = resolveTaskId(dependency.blocker);
      const blockedTaskId = resolveTaskId(dependency.blocked);

      if (
        blockerTaskId === undefined ||
        blockedTaskId === undefined ||
        blockerTaskId === blockedTaskId
      ) {
        return applyNext(rest, applied);
      }

      const edge = await taskGraph
        .applyDependency({
          blockedTaskId,
          blockerTaskId,
          extraSlackTargets,
          workspaceId: workspace.id,
        })
        .catch((error: unknown) => {
          void reportServerError({
            context: { route: 'meeting/dependency' },
            error,
          });

          return null;
        });

      return applyNext(
        rest,
        edge === null ? applied : [...applied, { blockedTaskId, blockerTaskId }]
      );
    };

    return applyNext(dependencies, []);
  };

  const applyExtraction = async ({
    existingTasks,
    extraction,
    meeting,
    recorderSlackUserId,
    workspace,
  }: {
    readonly existingTasks: readonly Task[];
    readonly extraction: MeetingExtraction;
    readonly meeting: Meeting;
    readonly recorderSlackUserId?: string;
    readonly workspace: Workspace;
  }): Promise<Meeting> => {
    const now = clock.now();
    const channels = await channelRepository.listByWorkspace({
      workspaceId: workspace.id,
    });
    const channelIds = new Set(channels.map((channel) => channel.channelId));
    const resolvedChannelId =
      meeting.requestedChannelId ??
      (extraction.channelId !== undefined &&
      channelIds.has(extraction.channelId)
        ? extraction.channelId
        : channels.find((channel) => channel.status === 'active')?.channelId);

    const created = await createTasksFromExtraction({
      creates: extraction.creates,
      meeting,
      now,
      ...(recorderSlackUserId === undefined ? {} : { recorderSlackUserId }),
      ...(resolvedChannelId === undefined ? {} : { resolvedChannelId }),
      workspace,
    });
    const createdTasks = created.map((entry) => entry.task);
    const createdIdByRef = new Map(
      created.map((entry) => [entry.ref, entry.task.id])
    );

    const updatedTaskIds = await applyUpdatesFromExtraction({
      updates: extraction.updates,
      workspace,
    });

    const meetingWithSlack =
      resolvedChannelId === undefined
        ? meeting
        : await postMeetingAnchor({
            createdTasks,
            meeting,
            resolvedChannelId,
            workspace,
          });

    // The model may reference a task by ref, by exact id, or — despite the
    // prompt — by (possibly translated) title. Resolve in that order instead
    // of passing bogus ids through to applyDependency.
    const existingWorkTasks = existingTasks.filter(isWorkTask);
    const existingIds = new Set(existingWorkTasks.map((task) => task.id));
    const normalizeTitle = (title: string): string =>
      title.trim().toLowerCase();
    const idByTitle = new Map(
      [...existingWorkTasks, ...createdTasks].map((task) => [
        normalizeTitle(task.title),
        task.id,
      ])
    );
    const resolveTaskId = (refOrId: string): string | undefined => {
      const fromRef = createdIdByRef.get(refOrId);

      if (fromRef !== undefined) {
        return fromRef;
      }

      if (existingIds.has(refOrId)) {
        return refOrId;
      }

      return idByTitle.get(normalizeTitle(refOrId));
    };
    const extraSlackTargets =
      meetingWithSlack.channelId !== undefined &&
      meetingWithSlack.slackThreadTs !== undefined
        ? [
            {
              channelId: meetingWithSlack.channelId,
              threadTs: meetingWithSlack.slackThreadTs,
            },
          ]
        : [];
    const appliedDependencies = await applyDependenciesFromExtraction({
      dependencies: extraction.dependencies,
      extraSlackTargets,
      resolveTaskId,
      workspace,
    });

    return meetingSchema.parse({
      ...meetingWithSlack,
      createdTaskIds: createdTasks.map((task) => task.id),
      dependencies: appliedDependencies,
      status: 'completed',
      updatedTaskIds,
    });
  };

  const ingestToGBrainBestEffort = async ({
    meeting,
    workspace,
  }: {
    readonly meeting: Meeting;
    readonly workspace: Workspace;
  }): Promise<void> => {
    if (!gbrainIngestGateway.isEnabled()) {
      return;
    }

    const allTasks = await taskRepository
      .listByWorkspace({ workspaceId: workspace.id })
      .catch((): readonly Task[] => []);
    const tasksById = new Map(allTasks.map((task) => [task.id, task]));
    const meetingTasks = [
      ...meeting.createdTaskIds,
      ...meeting.updatedTaskIds,
    ].flatMap((taskId) => {
      const task = tasksById.get(taskId);

      return task !== undefined && isWorkTask(task) ? [task] : [];
    });

    await gbrainIngestGateway
      .ingestPage({
        markdown: buildMeetingPageMarkdown({ meeting, tasks: meetingTasks }),
        slug: `meetings/rec-${meeting.id}`,
        workspaceId: workspace.id,
      })
      .catch((error: unknown) => {
        void reportServerError({
          context: { route: 'meeting/gbrain-page' },
          error,
        });
      });

    const factLines = [
      ...(meeting.notes?.overview === undefined
        ? []
        : [meeting.notes.overview]),
      ...(meeting.notes?.decisions ?? []),
      ...meetingTasks.map((task) =>
        workspace.language === 'ja'
          ? `タスク「${task.title}」(担当: ${
              task.assigneeSlackUserIds.length > 0
                ? task.assigneeSlackUserIds.join(', ')
                : '未割り当て'
            })`
          : `Task "${task.title}" (assignees: ${
              task.assigneeSlackUserIds.length > 0
                ? task.assigneeSlackUserIds.join(', ')
                : 'unassigned'
            })`
      ),
    ];

    if (factLines.length > 0) {
      await gbrainIngestGateway
        .extractFacts({
          sessionId: meeting.id,
          text: factLines.join('\n'),
          workspaceId: workspace.id,
        })
        .catch((error: unknown) => {
          void reportServerError({
            context: { route: 'meeting/gbrain-facts' },
            error,
          });
        });
    }

    ingestTaskPagesBestEffort({
      gbrainIngestGateway,
      tasks: meetingTasks,
      tasksById,
      workspaceId: workspace.id,
    });
  };

  return {
    createForUser: async ({
      channelId,
      durationSeconds,
      participantSlackUserIds,
      userId,
      workspaceId,
    }): Promise<Meeting> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });
      const now = clock.now();
      const meeting = meetingSchema.parse({
        createdAt: now,
        createdByUserId: userId,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        id: idGenerator.generateId(),
        ...(participantSlackUserIds === undefined
          ? {}
          : { participantSlackUserIds }),
        ...(channelId === undefined ? {} : { requestedChannelId: channelId }),
        status: 'processing',
        updatedAt: now,
        workspaceId,
      });

      await meetingRepository.create({ meeting });

      return meeting;
    },
    getForUser: async ({
      meetingId,
      userId,
      workspaceId,
    }): Promise<Meeting> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return getMeetingOrThrow({ meetingId, workspaceId });
    },
    listForUser: async ({
      userId,
      workspaceId,
    }): Promise<readonly Meeting[]> => {
      await getWorkspaceForUser({
        userId,
        userProfileRepository,
        workspaceId,
        workspaceRepository,
      });

      return meetingRepository.listByWorkspace({ workspaceId });
    },
    process: async ({
      audioBase64,
      meetingId,
      mimeType,
      workspaceId,
    }): Promise<void> => {
      /* eslint-disable functional/no-try-statements -- the pipeline converts any failure into a failed meeting document. */
      try {
        const [meeting, workspace] = await Promise.all([
          getMeetingOrThrow({ meetingId, workspaceId }),
          getWorkspaceOrThrow(workspaceId),
        ]);
        const [channels, members, recorderSlackUserId, tasks] =
          await Promise.all([
            channelRepository.listByWorkspace({ workspaceId }),
            listMembersBestEffort(workspace),
            resolveRecorderSlackUserId({
              userId: meeting.createdByUserId,
              workspaceId,
            }),
            taskRepository.listByWorkspace({ workspaceId }),
          ]);
        const participantIds = new Set(meeting.participantSlackUserIds);
        const participants = members.filter((member) =>
          participantIds.has(member.slackUserId)
        );
        const transcription = await meetingComposer.transcribeRecording({
          audioBase64,
          language: workspace.language,
          mimeType,
          ...(participants.length === 0 ? {} : { participants }),
        });
        const transcribed = await updateMeeting(
          meetingSchema.parse({
            ...meeting,
            notes: {
              decisions: transcription.decisions,
              keyPoints: transcription.keyPoints,
              ...(transcription.overview.length === 0
                ? {}
                : { overview: transcription.overview }),
            },
            ...(transcription.overview.length === 0
              ? {}
              : { summary: transcription.overview }),
            title: transcription.title,
            transcript: transcription.transcript,
          })
        );
        const channelContexts: readonly MeetingChannelContext[] = channels
          .filter((channel) => channel.status === 'active')
          .map((channel) => ({
            channelId: channel.channelId,
            name: channel.name,
          }));
        const extraction = await meetingComposer.extractOperations({
          channels: channelContexts,
          ...(transcribed.requestedChannelId === undefined
            ? {}
            : { fixedChannelId: transcribed.requestedChannelId }),
          language: workspace.language,
          members,
          now: clock.now(),
          ...(meeting.participantSlackUserIds.length === 0
            ? {}
            : { participantSlackUserIds: meeting.participantSlackUserIds }),
          ...(recorderSlackUserId === undefined ? {} : { recorderSlackUserId }),
          tasks,
          timezone: workspace.timezone,
          transcript: transcription.transcript,
        });
        const applied = await applyExtraction({
          existingTasks: tasks,
          extraction,
          meeting: transcribed,
          ...(recorderSlackUserId === undefined ? {} : { recorderSlackUserId }),
          workspace,
        });
        const completed = await updateMeeting(applied);

        await ingestToGBrainBestEffort({ meeting: completed, workspace });
      } catch (error) {
        void reportServerError({
          context: { route: 'meeting/process' },
          error,
        });
        await meetingRepository
          .getById({ meetingId, workspaceId })
          .then((meeting) =>
            meeting === null
              ? undefined
              : meetingRepository.update({
                  meeting: meetingSchema.parse({
                    ...meeting,
                    error:
                      error instanceof Error ? error.message : String(error),
                    status: 'failed',
                    updatedAt: clock.now(),
                  }),
                })
          )
          .catch((): undefined => undefined);
      }
      /* eslint-enable functional/no-try-statements */
    },
  };
};
