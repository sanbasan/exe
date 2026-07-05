/* eslint-disable no-process-env -- Agent config boundary is the only place that reads runtime environment variables. */
/* eslint-disable max-lines -- A flat, well-commented registry of runtime config knobs; splitting it would hurt readability more than the length does. */

const parseBoolean = ({
  fallback,
  value,
}: {
  readonly fallback: boolean;
  readonly value?: string;
}): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parsePositiveInteger = ({
  fallback,
  value,
}: {
  readonly fallback: number;
  readonly value?: string;
}): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseLoadThreshold = ({
  fallback,
  value,
}: {
  readonly fallback: number;
  readonly value?: string;
}): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
};

export type RealtimeProvider = 'google' | 'openai';

export type OpenAIRealtimeReasoningEffort =
  | 'high'
  | 'low'
  | 'medium'
  | 'minimal'
  | 'xhigh';

const firstNonEmpty = (
  ...values: readonly (string | undefined)[]
): string | undefined =>
  values.find((value) => value !== undefined && value.length > 0);

const parseRealtimeProvider = (value?: string): RealtimeProvider => {
  if (value === undefined || value.length === 0) {
    return 'google';
  }

  switch (value) {
    case 'google':
    case 'openai':
      return value;
  }

  throw new Error('REALTIME_PROVIDER must be either "google" or "openai".');
};

const parseOpenAIRealtimeReasoningEffort = (
  value?: string
): OpenAIRealtimeReasoningEffort => {
  if (value === undefined || value.length === 0) {
    return 'medium';
  }

  switch (value) {
    case 'high':
    case 'low':
    case 'medium':
    case 'minimal':
    case 'xhigh':
      return value;
  }

  throw new Error(
    'OPENAI_REALTIME_REASONING_EFFORT must be one of: minimal, low, medium, high, xhigh.'
  );
};

const OPENAI_REALTIME_SPEED_MIN = 0.25;
const OPENAI_REALTIME_SPEED_MAX = 1.5;

export const isOpenAIRealtimeSpeed = (value: number): boolean =>
  Number.isFinite(value) &&
  value >= OPENAI_REALTIME_SPEED_MIN &&
  value <= OPENAI_REALTIME_SPEED_MAX;

const parseOpenAIRealtimeSpeed = (value?: string): number => {
  if (value === undefined || value.trim().length === 0) {
    return 1.2;
  }

  const parsed = Number(value);

  if (!isOpenAIRealtimeSpeed(parsed)) {
    throw new Error(
      'OPENAI_REALTIME_SPEED must be a number between 0.25 and 1.5.'
    );
  }

  return parsed;
};

export const agentConfig = {
  // Background assistant (tool-caller) agent: a Gemini text model that
  // executes tools autonomously off the voice path. The voice model only
  // dispatches requests to it. Falls back to the server-side Gemini fallback
  // model automatically on capacity errors (see @exe/server generateContent).
  assistant: {
    // How long call finalization waits for in-flight assistant jobs after the
    // user hangs up, so their drafts land before the summary is built and the
    // session transitions to "ended" (the post-call apply reads from there).
    drainTimeoutMs: parsePositiveInteger({
      fallback: 60_000,
      ...(process.env['EXE_ASSISTANT_DRAIN_TIMEOUT_MS'] === undefined
        ? {}
        : { value: process.env['EXE_ASSISTANT_DRAIN_TIMEOUT_MS'] }),
    }),
    maxSteps: parsePositiveInteger({
      fallback: 8,
      ...(process.env['EXE_ASSISTANT_MAX_STEPS'] === undefined
        ? {}
        : { value: process.env['EXE_ASSISTANT_MAX_STEPS'] }),
    }),
    model: process.env['EXE_ASSISTANT_MODEL'] ?? 'gemini-3.5-flash',
    timeoutMs: parsePositiveInteger({
      fallback: 180_000,
      ...(process.env['EXE_ASSISTANT_TIMEOUT_MS'] === undefined
        ? {}
        : { value: process.env['EXE_ASSISTANT_TIMEOUT_MS'] }),
    }),
  },
  dataChannel: {
    topic: process.env['EXE_AGENT_DATA_TOPIC'] ?? 'exe.call',
  },
  livekit: {
    agentName: process.env['LIVEKIT_AGENT_NAME'] ?? 'exe-task-review-agent',
  },
  // ─── GBrain integration — purgeable (gbrain/PURGE.md): background memory
  // scout that pulls long-term-memory context for the current topic into the
  // voice model's chat context, silently (no spoken notice, no interruption).
  memoryScout: {
    // Per-topic cooldown: a second lookup for the same channel (or the same
    // channel-less scope) within this window is skipped, so a chatty voice
    // model cannot spam GBrain with duplicate searches.
    cooldownMs: parsePositiveInteger({
      fallback: 240_000,
      ...(process.env['EXE_MEMORY_SCOUT_COOLDOWN_MS'] === undefined
        ? {}
        : { value: process.env['EXE_MEMORY_SCOUT_COOLDOWN_MS'] }),
    }),
    // Search (1-2 steps) + optional page read + the findings digest each
    // consume a tool step before the final briefing.
    maxSteps: parsePositiveInteger({
      fallback: 5,
      ...(process.env['EXE_MEMORY_SCOUT_MAX_STEPS'] === undefined
        ? {}
        : { value: process.env['EXE_MEMORY_SCOUT_MAX_STEPS'] }),
    }),
    // A scout that takes longer than this is abandoned silently: context that
    // arrives after the topic has moved on is worse than no context.
    timeoutMs: parsePositiveInteger({
      fallback: 45_000,
      ...(process.env['EXE_MEMORY_SCOUT_TIMEOUT_MS'] === undefined
        ? {}
        : { value: process.env['EXE_MEMORY_SCOUT_TIMEOUT_MS'] }),
    }),
  },
  // Deterministic call pacer: silent time-check notes that make the voice
  // agent chair the clock (first note just before the target length, then a
  // firmer push every interval). Pure timers, no LLM.
  pacing: {
    // When the first "そろそろ10分" note fires (default 9.5 minutes).
    firstNoteMs: parsePositiveInteger({
      fallback: 570_000,
      ...(process.env['EXE_CALL_PACER_FIRST_NOTE_MS'] === undefined
        ? {}
        : { value: process.env['EXE_CALL_PACER_FIRST_NOTE_MS'] }),
    }),
    // Gap between the recurring overtime notes after the first one.
    intervalMs: parsePositiveInteger({
      fallback: 600_000,
      ...(process.env['EXE_CALL_PACER_INTERVAL_MS'] === undefined
        ? {}
        : { value: process.env['EXE_CALL_PACER_INTERVAL_MS'] }),
    }),
    // Target call length in minutes; used in the prompt and the note wording.
    targetMinutes: parsePositiveInteger({
      fallback: 10,
      ...(process.env['EXE_CALL_TARGET_MINUTES'] === undefined
        ? {}
        : { value: process.env['EXE_CALL_TARGET_MINUTES'] }),
    }),
  },
  // ─── GBrain integration — purgeable (gbrain/PURGE.md): background probe
  // director that watches the conversation (driven by finalized user turns, not
  // by a voice tool call), finds the highest-value unknown about the person's
  // internal context, and injects one follow-up question silently. Self-limited
  // so the check-in never turns into an interrogation. ───
  probeDirector: {
    // Minimum gap between probe considerations: after one dispatch, further user
    // turns within this window are ignored, so the director cannot fire a GBrain
    // lookup on every utterance.
    cooldownMs: parsePositiveInteger({
      fallback: 30_000,
      ...(process.env['EXE_PROBE_DIRECTOR_COOLDOWN_MS'] === undefined
        ? {}
        : { value: process.env['EXE_PROBE_DIRECTOR_COOLDOWN_MS'] }),
    }),
    // Hard cap on injected follow-up questions per call — the "don't ask too
    // many questions in one meeting" rule, enforced in code.
    maxProbesPerCall: parsePositiveInteger({
      fallback: 4,
      ...(process.env['EXE_PROBE_DIRECTOR_MAX_PROBES'] === undefined
        ? {}
        : { value: process.env['EXE_PROBE_DIRECTOR_MAX_PROBES'] }),
    }),
    // Search (1-2) + the decision each consume a tool step.
    maxSteps: parsePositiveInteger({
      fallback: 4,
      ...(process.env['EXE_PROBE_DIRECTOR_MAX_STEPS'] === undefined
        ? {}
        : { value: process.env['EXE_PROBE_DIRECTOR_MAX_STEPS'] }),
    }),
    // A probe that takes longer than this is dropped: a stale "next question"
    // about a topic the call has moved past is worse than none.
    timeoutMs: parsePositiveInteger({
      fallback: 30_000,
      ...(process.env['EXE_PROBE_DIRECTOR_TIMEOUT_MS'] === undefined
        ? {}
        : { value: process.env['EXE_PROBE_DIRECTOR_TIMEOUT_MS'] }),
    }),
  },
  realtime: {
    google: {
      apiKey: firstNonEmpty(
        process.env['GOOGLE_API_KEY'],
        process.env['GEMINI_API_KEY']
      ),
      // Gemini 3.1 live models reject mid-session updates in
      // @livekit/agents-plugin-google (generateReply throws), which kills the
      // opening greeting, assistant-job notices, and silence nudges. Stay on
      // the 2.5 native-audio model until the plugin supports 3.1.
      model:
        process.env['GEMINI_LIVE_MODEL'] ??
        'gemini-2.5-flash-native-audio-preview-12-2025',
      useVertexAi: parseBoolean({
        fallback: false,
        ...(process.env['GOOGLE_GENAI_USE_VERTEXAI'] === undefined
          ? {}
          : { value: process.env['GOOGLE_GENAI_USE_VERTEXAI'] }),
      }),
      voice: process.env['GEMINI_LIVE_VOICE'] ?? 'Aoede',
    },
    openai: {
      apiKey: firstNonEmpty(process.env['OPENAI_API_KEY']),
      model: process.env['OPENAI_REALTIME_MODEL'] ?? 'gpt-realtime-2',
      reasoningEffort: parseOpenAIRealtimeReasoningEffort(
        process.env['OPENAI_REALTIME_REASONING_EFFORT']
      ),
      speed: parseOpenAIRealtimeSpeed(process.env['OPENAI_REALTIME_SPEED']),
      voice: process.env['OPENAI_REALTIME_VOICE'] ?? 'marin',
    },
    provider: parseRealtimeProvider(process.env['REALTIME_PROVIDER']),
  },
  session: {
    participantJoinTimeoutMs: 60_000,
  },
  worker: {
    initializeProcessTimeoutMs: parsePositiveInteger({
      fallback: 60_000,
      ...(process.env['EXE_AGENT_INITIALIZE_PROCESS_TIMEOUT_MS'] === undefined
        ? {}
        : { value: process.env['EXE_AGENT_INITIALIZE_PROCESS_TIMEOUT_MS'] }),
    }),
    jobSlotStaleAfterMs: parsePositiveInteger({
      fallback: 4 * 60 * 60_000,
      ...(process.env['EXE_AGENT_JOB_SLOT_STALE_AFTER_MS'] === undefined
        ? {}
        : { value: process.env['EXE_AGENT_JOB_SLOT_STALE_AFTER_MS'] }),
    }),
    loadThreshold: parseLoadThreshold({
      fallback: 0.7,
      ...(process.env['EXE_AGENT_LOAD_THRESHOLD'] === undefined
        ? {}
        : { value: process.env['EXE_AGENT_LOAD_THRESHOLD'] }),
    }),
    maxConcurrentJobs: parsePositiveInteger({
      fallback: 1,
      ...(process.env['EXE_AGENT_MAX_CONCURRENT_JOBS'] === undefined
        ? {}
        : { value: process.env['EXE_AGENT_MAX_CONCURRENT_JOBS'] }),
    }),
    numIdleProcesses: parsePositiveInteger({
      fallback: 1,
      ...(process.env['EXE_AGENT_NUM_IDLE_PROCESSES'] === undefined
        ? {}
        : { value: process.env['EXE_AGENT_NUM_IDLE_PROCESSES'] }),
    }),
  },
} as const;
