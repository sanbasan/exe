/* eslint-disable max-lines -- The call session lifecycle (setup, events, finalize) is intentionally kept together for reviewability. */
import { createAssistantJobRunner } from '#agent/assistant/jobs';
import {
  buildMemoryScoutSystemPrompt,
  createMemoryScout,
  MEMORY_SCOUT_TRIGGER_INSTRUCTION,
} from '#agent/assistant/memory-scout';
import {
  buildProbeDirectorSystemPrompt,
  createProbeDirector,
  PROBE_DIRECTOR_TRIGGER_INSTRUCTION,
} from '#agent/assistant/probe-director';
import { runAssistantAgent } from '#agent/assistant/runner';
import { buildAssistantSystemPrompt } from '#agent/assistant/system-prompt';
import { buildAssistantToolSet } from '#agent/assistant/tools';
import { buildScoutFindingsTool } from '#agent/assistant/tools/gbrain-findings-tool';
import { buildAssistantGBrainTools } from '#agent/assistant/tools/gbrain-tools';
import { createTranscriptStore } from '#agent/assistant/transcript-store';
import { createCallPacer } from '#agent/call-pacer';
import { agentConfig } from '#agent/config';
import {
  createConversationHoldState,
  installConversationDriver,
  USER_AWAY_TIMEOUT_SECONDS,
} from '#agent/conversation-driver';
import { publishCallData } from '#agent/data-channel';
import { createDraftRegistry } from '#agent/draft-registry';
import { ingestEndedSessionToGBrain } from '#agent/gbrain';
import { getGBrainConfig } from '#agent/gbrain/config';
import { releaseAgentJobSlot } from '#agent/job-capacity';
import { buildOpeningMessage } from '#agent/opening-message';
import { createRealtimeModel } from '#agent/realtime-model';
import { parseRoomMetadata } from '#agent/room-metadata';
import { buildDeterministicSummary } from '#agent/summary';
import { buildSystemPrompt } from '#agent/system-prompt';
import { buildAgentTools } from '#agent/tools';
import type { CallAgenda, Language, SlackWorkspaceMember } from '@exe/domain';
import {
  createFirebaseServerComposition,
  reportServerError,
  type ServerComposition,
} from '@exe/server';
import type { JobContext } from '@livekit/agents';
import { voice } from '@livekit/agents';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

interface AgentConversationMessage {
  readonly content: readonly unknown[];
  readonly role: 'assistant';
  readonly type: 'message';
}

const isAgentConversationMessage = (
  value: unknown
): value is AgentConversationMessage => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'type' in value &&
    value.type === 'message' &&
    'role' in value &&
    value.role === 'assistant' &&
    'content' in value &&
    Array.isArray(value.content)
  );
};

const recordTextEvent = async ({
  composition,
  sessionId,
  text,
  type,
  workspaceId,
}: {
  readonly composition: ServerComposition;
  readonly sessionId: string;
  readonly text: string;
  readonly type: 'agent_message' | 'transcript';
  readonly workspaceId: string;
}): Promise<void> => {
  if (text.trim().length === 0) {
    return;
  }

  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { text },
    type,
    workspaceId,
  });
};

const ignoreDataChannelError = (): null => null;

const reportSessionBackgroundError =
  (route: string) =>
  (error: unknown): void => {
    void reportServerError({
      context: { route },
      error,
    });
  };

// Renders the "## Target channel" line handed to assistant/scout runs: the
// resolved #name when the channel is known, otherwise the raw ID with a
// warning so the model verifies before acting.
const describeTargetChannel = ({
  channelId,
  channels,
}: {
  readonly channelId?: string;
  readonly channels: CallAgenda['channels'];
}): string | undefined => {
  if (channelId === undefined) {
    return undefined;
  }

  const name = channels.find(
    (channel) => channel.channelId === channelId
  )?.name;

  return name === undefined
    ? `channel ID: ${channelId} (not found in the agenda channel list — verify before acting)`
    : `#${name} (channel ID: ${channelId})`;
};

const getFocusTaskTitle = ({
  agenda,
}: {
  readonly agenda: CallAgenda;
}): string | undefined => {
  const focusTaskId = agenda.focusTaskId;

  if (focusTaskId === undefined) {
    return undefined;
  }

  return [
    ...agenda.workTasks,
    ...agenda.requestedWorkTasks,
    ...agenda.followUpTasks,
  ].find((task) => task.id === focusTaskId)?.title;
};

const finalizeCall = async ({
  composition,
  language,
  room,
  sessionId,
  topic,
  workspaceId,
}: {
  readonly composition: ServerComposition;
  readonly language: Language;
  readonly room: JobContext['room'];
  readonly sessionId: string;
  readonly topic: string;
  readonly workspaceId: string;
}): Promise<void> => {
  const session = await composition.services.callSession.getById({
    callSessionId: sessionId,
    workspaceId,
  });

  if (session.status !== 'active' && session.status !== 'ended') {
    return;
  }

  const events = await composition.services.callSession.listEvents({
    callSessionId: sessionId,
    workspaceId,
  });

  if (events.some((event) => event.type === 'summary')) {
    if (session.status === 'active') {
      await composition.services.callSession.transitionCall({
        callSessionId: sessionId,
        status: 'ended',
        workspaceId,
      });
    }

    return;
  }

  const summary = buildDeterministicSummary({
    events,
    language,
  });

  await composition.services.callSession.recordEvent({
    callSessionId: sessionId,
    payload: { summary },
    type: 'summary',
    workspaceId,
  });
  await publishCallData({
    message: {
      callSessionId: sessionId,
      summary,
      type: 'summary',
      workspaceId,
    },
    room,
    topic,
  }).catch(ignoreDataChannelError);
  if (session.status === 'active') {
    await composition.services.callSession.transitionCall({
      callSessionId: sessionId,
      status: 'ended',
      workspaceId,
    });
  }
};

// The user sees member names everywhere in the app, so the agent must see the
// same directory. A Slack API failure must not block the call: fall back to an
// empty list (the prompt then tells the model the list is unavailable).
const fetchWorkspaceMembers = async ({
  composition,
  sessionId,
  workspaceId,
}: {
  readonly composition: ServerComposition;
  readonly sessionId: string;
  readonly workspaceId: string;
}): Promise<readonly SlackWorkspaceMember[]> => {
  /* eslint-disable-next-line functional/no-try-statements -- Member names are a best-effort enrichment; the call must start even when Slack is unreachable. */
  try {
    const session = await composition.services.callSession.getById({
      callSessionId: sessionId,
      workspaceId,
    });

    return await composition.services.workspace.listSlackMembersForUser({
      userId: session.userId,
      workspaceId,
    });
  } catch (error: unknown) {
    void reportServerError({
      context: { route: 'agent/livekit/workspace_members' },
      error,
    });

    return [];
  }
};

export const handleSession = async (ctx: JobContext): Promise<void> => {
  const rawMetadata =
    ctx.job.metadata.length > 0 ? ctx.job.metadata : ctx.job.room?.metadata;
  const metadata = parseRoomMetadata({
    ...(rawMetadata === undefined ? {} : { rawMetadata }),
  });
  const composition = createFirebaseServerComposition();
  const [agenda, members] = await Promise.all([
    composition.services.callSession.getAgendaForSession({
      callSessionId: metadata.sessionId,
      workspaceId: metadata.workspaceId,
    }),
    fetchWorkspaceMembers({
      composition,
      sessionId: metadata.sessionId,
      workspaceId: metadata.workspaceId,
    }),
  ]);
  const hold = createConversationHoldState();
  const transcript = createTranscriptStore();
  // Drafts recorded across all assistant jobs of this call share one registry,
  // so a later job can revise or discard what an earlier job recorded.
  const registry = createDraftRegistry();
  const jobs = createAssistantJobRunner({
    runJob: async ({ channelId, priorJobs }): Promise<string> => {
      // Fetch a fresh agenda per job: an earlier job may have changed blocks,
      // reviews, or drafts, and the assistant must act on live state.
      const freshAgenda =
        await composition.services.callSession.getAgendaForSession({
          callSessionId: metadata.sessionId,
          workspaceId: metadata.workspaceId,
        });
      const targetChannel = describeTargetChannel({
        ...(channelId === undefined ? {} : { channelId }),
        channels: freshAgenda.channels,
      });

      return runAssistantAgent({
        maxSteps: agentConfig.assistant.maxSteps,
        model: agentConfig.assistant.model,
        priorTasks: priorJobs,
        systemPrompt: buildAssistantSystemPrompt({
          agenda: freshAgenda,
          members,
        }),
        ...(targetChannel === undefined ? {} : { targetChannel }),
        tools: buildAssistantToolSet({
          agenda: freshAgenda,
          ...(channelId === undefined ? {} : { channelId }),
          composition,
          registry,
          room: ctx.room,
          sessionId: metadata.sessionId,
          topic: agentConfig.dataChannel.topic,
          workspaceId: metadata.workspaceId,
        }),
        transcript: transcript.snapshot(),
      });
    },
    timeoutMs: agentConfig.assistant.timeoutMs,
  });
  // ─── GBrain integration — purgeable (gbrain/PURGE.md): the memory scout
  // feeds long-term-memory context to the voice model by APPENDING to its chat
  // context (never generateReply), so unlike assistant-job notices it cannot
  // interrupt in-progress speech — which is why the prompt may trigger it on
  // every topic change. ───
  /* eslint-disable functional/no-let -- The scout/director must exist before the voice.Agent that owns the chat context; the reference is assigned right after construction below. */
  let scoutTargetAgent: voice.Agent | null = null;
  /* eslint-enable functional/no-let */
  // Silent chat-context injection shared by the memory scout and the probe
  // director: append the note to the voice model's chat context without
  // generating speech, so neither background agent can interrupt in-progress
  // speech. Safe to call after the session has closed (no-ops if never wired).
  const injectVoiceContext = async (note: string): Promise<void> => {
    if (scoutTargetAgent === null) {
      return;
    }

    const chatCtx = scoutTargetAgent.chatCtx.copy();

    chatCtx.addMessage({ content: note, role: 'user' });
    await scoutTargetAgent.updateChatCtx(chatCtx);
  };
  const scout =
    getGBrainConfig() === null
      ? undefined
      : createMemoryScout({
          cooldownMs: agentConfig.memoryScout.cooldownMs,
          injectContext: injectVoiceContext,
          runLookup: ({ channelId }): Promise<string> => {
            const targetChannel = describeTargetChannel({
              ...(channelId === undefined ? {} : { channelId }),
              channels: agenda.channels,
            });
            const publishContext = {
              ...(channelId === undefined ? {} : { channelId }),
              lookupId: randomUUID(),
              room: ctx.room,
              sessionId: metadata.sessionId,
              topic: agentConfig.dataChannel.topic,
            };
            const workspaceId = metadata.workspaceId;

            return runAssistantAgent({
              maxSteps: agentConfig.memoryScout.maxSteps,
              model: agentConfig.assistant.model,
              systemPrompt: buildMemoryScoutSystemPrompt({
                language: metadata.language,
                now: new Date().toISOString(),
                timezone: agenda.timezone,
              }),
              ...(targetChannel === undefined ? {} : { targetChannel }),
              tools: {
                ...buildAssistantGBrainTools({ publishContext, workspaceId }),
                ...buildScoutFindingsTool({
                  language: metadata.language,
                  publishContext,
                  workspaceId,
                }),
              },
              transcript: transcript.snapshot(),
              triggerInstruction: MEMORY_SCOUT_TRIGGER_INSTRUCTION,
            });
          },
          timeoutMs: agentConfig.memoryScout.timeoutMs,
        });
  // ─── GBrain integration — purgeable (gbrain/PURGE.md): the probe director
  // runs off finalized user turns (no voice tool call), consults GBrain for what
  // is already known, and silently injects one follow-up question about a
  // genuine unknown. Same silent injection path as the scout. ───
  const probeDirector =
    getGBrainConfig() === null
      ? undefined
      : createProbeDirector({
          cooldownMs: agentConfig.probeDirector.cooldownMs,
          injectContext: injectVoiceContext,
          maxProbesPerCall: agentConfig.probeDirector.maxProbesPerCall,
          runProbe: (): Promise<string> =>
            runAssistantAgent({
              maxSteps: agentConfig.probeDirector.maxSteps,
              model: agentConfig.assistant.model,
              systemPrompt: buildProbeDirectorSystemPrompt({
                language: metadata.language,
                now: new Date().toISOString(),
                timezone: agenda.timezone,
              }),
              tools: buildAssistantGBrainTools({
                workspaceId: metadata.workspaceId,
              }),
              transcript: transcript.snapshot(),
              triggerInstruction: PROBE_DIRECTOR_TRIGGER_INSTRUCTION,
            }),
          timeoutMs: agentConfig.probeDirector.timeoutMs,
        });
  // Deterministic call pacer (no LLM): injects silent time-check notes so the
  // voice agent chairs the clock. Started only once the participant joins.
  const pacer = createCallPacer({
    firstNoteMs: agentConfig.pacing.firstNoteMs,
    injectContext: injectVoiceContext,
    intervalMs: agentConfig.pacing.intervalMs,
    targetMinutes: agentConfig.pacing.targetMinutes,
  });
  const agent = new voice.Agent({
    instructions: buildSystemPrompt({
      agenda,
      members,
      memoryScoutEnabled: scout !== undefined,
      targetCallMinutes: agentConfig.pacing.targetMinutes,
    }),
    tools: buildAgentTools({
      hold,
      jobs,
      ...(scout === undefined ? {} : { scout }),
    }),
  });

  scoutTargetAgent = agent;
  const agentSession = new voice.AgentSession({
    llm: createRealtimeModel(),
    userAwayTimeout: USER_AWAY_TIMEOUT_SECONDS,
  });

  installConversationDriver({ hold, session: agentSession });

  agentSession.on(
    voice.AgentSessionEventTypes.UserInputTranscribed,
    (event) => {
      if (event.isFinal) {
        transcript.append({ role: 'user', text: event.transcript });
        // Let the probe director consider this turn (no-op when GBrain is
        // off). It self-throttles; dispatching per turn is intentional. Once
        // the call is past its target length, deep dives stop — the chair is
        // wrapping up, so no new probe suggestions.
        if (!pacer.isOvertime()) {
          probeDirector?.dispatch();
        }
        void recordTextEvent({
          composition,
          sessionId: metadata.sessionId,
          text: event.transcript,
          type: 'transcript',
          workspaceId: metadata.workspaceId,
        }).catch(reportSessionBackgroundError('agent/livekit/transcript'));
      }
    }
  );
  agentSession.on(
    voice.AgentSessionEventTypes.ConversationItemAdded,
    (event) => {
      if (!isAgentConversationMessage(event.item)) {
        return;
      }

      const text = event.item.content
        .filter((content): content is string => typeof content === 'string')
        .join('');

      transcript.append({ role: 'agent', text });
      void recordTextEvent({
        composition,
        sessionId: metadata.sessionId,
        text,
        type: 'agent_message',
        workspaceId: metadata.workspaceId,
      }).catch(reportSessionBackgroundError('agent/livekit/agent_message'));
    }
  );
  // AgentSessionEventTypes.Error is the literal "error" event: with no
  // listener, Node's EventEmitter turns every emitted model error (e.g. an
  // OpenAI rate limit, which is recoverable) into an uncaught exception.
  agentSession.on(voice.AgentSessionEventTypes.Error, (event) => {
    // event.error is often a plain object (e.g. a RealtimeModelError shape),
    // which Sentry renders as "[object Object]" — inspect() keeps it readable.
    void reportServerError({
      context: { route: 'agent/livekit/agent_session_error' },
      error:
        event.error instanceof Error
          ? event.error
          : new Error(inspect(event.error, { depth: 4 })),
    });
  });
  agentSession.on(voice.AgentSessionEventTypes.Close, () => {
    pacer.dispose();
    // Drain in-flight assistant jobs (bounded) BEFORE finalizing: their
    // drafts must be recorded before the summary is built and the session
    // transitions to "ended", or the post-call apply pipeline may miss them.
    const finalized = jobs
      .waitForIdle({ timeoutMs: agentConfig.assistant.drainTimeoutMs })
      .then(() =>
        finalizeCall({
          composition,
          language: metadata.language,
          room: ctx.room,
          sessionId: metadata.sessionId,
          topic: agentConfig.dataChannel.topic,
          workspaceId: metadata.workspaceId,
        })
      )
      .catch(reportSessionBackgroundError('agent/livekit/finalize_call'));
    // ─── GBrain integration — purgeable (gbrain/PURGE.md): delete these 2
    // lines + the `#agent/gbrain` import, then remove app/agent/src/gbrain/. ───
    void finalized.then(() =>
      ingestEndedSessionToGBrain({ composition, metadata })
    );
    void finalized.finally(() => {
      void releaseAgentJobSlot({ jobId: ctx.job.id }).catch(
        reportSessionBackgroundError('agent/livekit/release_job_slot')
      );
    });
  });

  await agentSession.start({
    agent,
    room: ctx.room,
  });

  const participantJoined = await Promise.race([
    ctx.waitForParticipant().then(() => true),
    new Promise<false>((resolve) => {
      setTimeout(
        () => resolve(false),
        agentConfig.session.participantJoinTimeoutMs
      );
    }),
  ]);

  if (!participantJoined) {
    await composition.services.callSession.transitionCall({
      callSessionId: metadata.sessionId,
      status: 'missed',
      workspaceId: metadata.workspaceId,
    });
    await releaseAgentJobSlot({ jobId: ctx.job.id });

    return;
  }

  // The participant is in the room: the meeting clock starts now.
  pacer.start();
  // Kick off the greeting before the Firestore/data-channel work: generateReply
  // is non-blocking, and every await before it delays the first spoken response.
  const focusTaskTitle = getFocusTaskTitle({ agenda });
  agentSession.generateReply({
    allowInterruptions: true,
    instructions: `Say exactly this greeting and nothing else: ${JSON.stringify(
      buildOpeningMessage({
        ...(focusTaskTitle === undefined ? {} : { focusTaskTitle }),
        language: metadata.language,
        purpose: metadata.purpose,
      })
    )}`,
  });
  await composition.services.callSession.activateCall({
    callSessionId: metadata.sessionId,
    workspaceId: metadata.workspaceId,
  });
  await publishCallData({
    message: {
      agenda,
      callSessionId: metadata.sessionId,
      type: 'agenda',
      workspaceId: metadata.workspaceId,
    },
    room: ctx.room,
    topic: agentConfig.dataChannel.topic,
  }).catch(ignoreDataChannelError);
};
