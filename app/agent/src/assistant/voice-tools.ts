import type { AssistantJobRunner } from '#agent/assistant/jobs';
import type { MemoryScout } from '#agent/assistant/memory-scout';
import { withToolErrorReporting } from '#agent/tool-error-handling';
import { llm } from '@livekit/agents';
import { z } from 'zod';

// The voice agent's whole tool surface for actions: it can only TRIGGER the
// background assistant and check on triggered tasks. run_assistant_task
// carries no instruction text at all — the assistant reads the conversation
// transcript and determines what to do by itself. This keeps every voice tool
// call near-zero-cost to emit, so the realtime model never stalls preparing
// tool-call arguments — the root cause of in-call hangs.

const runAssistantTaskParametersSchema = z
  .object({
    channelId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Slack channel ID of the channel the work concerns, copied exactly from the channel lists in your instructions (e.g. "C0123ABCDEF"). Pass it whenever the work is about one specific channel; omit it for schedule, workspace-memory, or cross-channel work. This is the only argument this tool takes.'
      ),
  })
  .strict();

const fetchMemoryContextParametersSchema = z
  .object({
    channelId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Slack channel ID of the channel the current topic concerns, copied exactly from the channel lists in your instructions (e.g. "C0123ABCDEF"). Pass it whenever the topic is one specific channel; omit it for cross-channel or channel-less topics. This is the only argument this tool takes.'
      ),
  })
  .strict();

// ─── GBrain integration — purgeable (gbrain/PURGE.md): delete this builder
// and its uses in tools.ts / session-handler.ts. ───
export const buildMemoryScoutVoiceTools = ({
  scout,
}: {
  readonly scout: MemoryScout;
}): llm.ToolContext => ({
  fetch_memory_context: llm.tool({
    description:
      'Silently pull workspace long-term memory (GBrain) context about the CURRENT topic into your own background knowledge. Trigger it liberally — every time the conversation moves onto a channel (pass its channelId) or a new project/topic, including at the start of each per-channel review. It is completely silent: it never speaks, never interrupts you, sends NO completion notice, and needs NO spoken preamble — just trigger and keep talking. Relevant past-call notes appear in your context by themselves a few seconds later. When the user explicitly ASKS what was said or decided before and is waiting for the answer, use run_assistant_task instead so the result is reported back.',
    execute: withToolErrorReporting({
      execute: (
        args: z.infer<typeof fetchMemoryContextParametersSchema>
      ): Promise<string> => {
        const result = scout.dispatch({
          ...(args.channelId === undefined
            ? {}
            : { channelId: args.channelId }),
        });

        return Promise.resolve(
          result === 'started'
            ? 'Background memory lookup started. Do not mention it and do not wait for it — continue the conversation. Any relevant notes will be added to your context silently.'
            : 'A recent lookup already covered this topic; its notes are in your context if anything was found. Continue the conversation.'
        );
      },
      toolName: 'fetch_memory_context',
    }),
    parameters: fetchMemoryContextParametersSchema,
  }),
});

export const buildAssistantVoiceTools = ({
  jobs,
}: {
  readonly jobs: AssistantJobRunner;
}): llm.ToolContext => ({
  check_assistant_tasks: llm.tool({
    description:
      'Check the status of background assistant tasks triggered earlier in this call with run_assistant_task. Use it when the user asks whether something finished, or before the closing summary to confirm what was recorded.',
    execute: withToolErrorReporting({
      execute: (): Promise<string> => {
        const snapshots = jobs.list();

        return Promise.resolve(
          snapshots.length === 0
            ? 'No background assistant tasks have been triggered in this call.'
            : JSON.stringify(snapshots)
        );
      },
      toolName: 'check_assistant_tasks',
    }),
  }),
  run_assistant_task: llm.tool({
    description:
      'Trigger the background assistant. It reads the full conversation transcript up to this moment, works out ON ITS OWN what the user just asked for or confirmed (recording/updating tasks and follow-ups, channel reviews, latest info, call schedule changes, workspace memory lookups), and does it. You write NO instruction — the conversation itself is the instruction. The facts must have been said in the call (usually by the user; ask naturally for anything missing), but do NOT recite them back — acknowledge briefly and trigger in the same turn, and trigger again if they correct you. Trigger once right after each stated action (or batch). This tool returns IMMEDIATELY; keep talking, and the result arrives as a [system] notice — speak about it only if there is something worth saying.',
    execute: withToolErrorReporting({
      execute: (
        args: z.infer<typeof runAssistantTaskParametersSchema>,
        opts: llm.ToolOptions
      ): Promise<string> => {
        const jobId = jobs.dispatch({
          ...(args.channelId === undefined
            ? {}
            : { channelId: args.channelId }),
          session: opts.ctx.session,
        });

        return Promise.resolve(
          `Background task ${jobId} started from the conversation so far. Continue the conversation naturally; a system notice will report the result. Do not trigger again for the same action while it is running.`
        );
      },
      toolName: 'run_assistant_task',
    }),
    parameters: runAssistantTaskParametersSchema,
  }),
});
