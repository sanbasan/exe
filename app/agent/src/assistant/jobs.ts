import { isAgentSessionNotRunningError } from '#agent/agent-session-errors';
import { reportServerError } from '@exe/server';

export type AssistantJobStatus = 'completed' | 'failed' | 'running';

export interface AssistantJobSnapshot {
  readonly jobId: string;
  readonly report?: string;
  readonly status: AssistantJobStatus;
}

// The minimal slice of voice.AgentSession the job runner needs to deliver
// results back into the conversation as a system nudge.
export interface AssistantNudgeSession {
  readonly generateReply: (options: {
    readonly allowInterruptions: boolean;
    readonly instructions: string;
    readonly toolChoice: 'none';
  }) => unknown;
}

export interface AssistantJobRunner {
  readonly dispatch: (params: {
    readonly channelId?: string;
    readonly session: AssistantNudgeSession;
  }) => string;
  readonly list: () => readonly AssistantJobSnapshot[];
  // Resolves when every dispatched job's underlying work has finished (not
  // merely watchdog-settled), or after timeoutMs — whichever comes first.
  // Used at call close so drafts recorded by in-flight jobs land BEFORE the
  // summary is built and the session transitions to "ended" (the post-call
  // apply pipeline reads events from that point).
  readonly waitForIdle: (params: {
    readonly timeoutMs: number;
  }) => Promise<void>;
}

const completedNotice = ({
  jobId,
  report,
}: {
  readonly jobId: string;
  readonly report: string;
}): string =>
  [
    `[system] Background task ${jobId} is done. Result:`,
    report,
    'This result is for YOUR eyes — do not narrate it. Speak about it only when there is something worth saying: if it asks a question, ask the user that question out loud; if it contains composed text, at most a one-sentence gist when relevant; if something went wrong, tell the user plainly. For a routine success, at most a short natural aside at the next pause ("さっきの、記録してあります") — or nothing if the conversation has moved on. Never read IDs aloud, never mention this notice, and never describe system state (no "反映されます" talk). Continue leading the call in the conversation language.',
  ].join('\n');

const failedNotice = ({ jobId }: { readonly jobId: string }): string =>
  `[system] Background task ${jobId} failed with an internal error and nothing was saved. When it fits the flow, tell the user in a natural, human way that the note did not get recorded (e.g. "すみません、さっきの記録できていなかったので、もう一度やっておきます") and retry by triggering the assistant again. Do not mention this notice or any system details.`;

const timeoutNotice = ({ jobId }: { readonly jobId: string }): string =>
  `[system] Background task ${jobId} is taking too long and was marked failed, though it may still finish in the background. Do not narrate the delay as system status; if the user asks, say it naturally ("さっきの、まだ手元で確認できていません"). Check check_assistant_tasks before the closing summary in case it completed after all. Do not mention this notice.`;

// Runs assistant jobs in the background and reports their outcomes into the
// live conversation. Multiple jobs may run concurrently; each settles exactly
// once (completion, failure, or watchdog timeout — whichever happens first).
export const createAssistantJobRunner = ({
  runJob,
  timeoutMs,
}: {
  readonly runJob: (params: {
    readonly channelId?: string;
    // Snapshots of every job dispatched before this one, so the assistant can
    // see what earlier triggers already handled and avoid double-recording.
    readonly priorJobs: readonly AssistantJobSnapshot[];
  }) => Promise<string>;
  readonly timeoutMs: number;
}): AssistantJobRunner => {
  /* eslint-disable functional/no-let, functional/immutable-data -- Session-local mutable job registry by design. */
  let nextId = 1;
  const jobs = new Map<string, AssistantJobSnapshot>();
  const inFlight = new Set<Promise<void>>();

  const notify = ({
    instructions,
    session,
  }: {
    readonly instructions: string;
    readonly session: AssistantNudgeSession;
  }): void => {
    /* eslint-disable-next-line functional/no-try-statements -- The call may have ended while the job was running; a closed session must not crash the worker. */
    try {
      session.generateReply({
        allowInterruptions: true,
        instructions,
        toolChoice: 'none',
      });
    } catch (error: unknown) {
      // The user hanging up while a job is in flight is a normal race (jobs
      // deliberately drain past session close); only report real failures.
      if (isAgentSessionNotRunningError(error)) {
        return;
      }

      void reportServerError({
        context: { route: 'agent/assistant/jobs_notify' },
        error,
      });
    }
  };

  return {
    dispatch: ({ channelId, session }): string => {
      const jobId = `a${String(nextId)}`;
      const priorJobs = [...jobs.values()];

      nextId += 1;
      jobs.set(jobId, { jobId, status: 'running' });

      let settled = false;
      const record = ({
        report,
        status,
      }: {
        readonly report?: string;
        readonly status: AssistantJobStatus;
      }): void => {
        jobs.set(jobId, {
          jobId,
          ...(report === undefined ? {} : { report }),
          status,
        });
      };
      const settle = ({
        instructions,
        report,
        status,
      }: {
        readonly instructions: string;
        readonly report?: string;
        readonly status: AssistantJobStatus;
      }): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(watchdog);
        record({ ...(report === undefined ? {} : { report }), status });
        notify({ instructions, session });
      };
      const watchdog = setTimeout(() => {
        settle({
          instructions: timeoutNotice({ jobId }),
          status: 'failed',
        });
      }, timeoutMs);

      const work = runJob({
        ...(channelId === undefined ? {} : { channelId }),
        priorJobs,
      })
        .then((report) => {
          if (settled) {
            // The watchdog already told the conversation this job failed, but
            // the work did finish and its drafts are recorded — reflect that
            // in the status list without a second (contradictory) nudge.
            record({ report, status: 'completed' });

            return;
          }

          settle({
            instructions: completedNotice({ jobId, report }),
            report,
            status: 'completed',
          });
        })
        .catch((error: unknown) => {
          void reportServerError({
            context: { route: 'agent/assistant/run_job' },
            error,
          });
          settle({
            instructions: failedNotice({ jobId }),
            status: 'failed',
          });
        });

      inFlight.add(work);
      void work.finally(() => {
        inFlight.delete(work);
      });

      return jobId;
    },
    list: (): readonly AssistantJobSnapshot[] => [...jobs.values()],
    waitForIdle: async ({ timeoutMs: waitTimeoutMs }): Promise<void> => {
      const deadline = Date.now() + waitTimeoutMs;

      // Re-check after each settlement burst: a job may be dispatched while
      // another is finishing (not after close, but waitForIdle stays correct
      // either way).
      /* eslint-disable-next-line functional/no-loop-statements -- Bounded drain loop over a mutating in-flight set. */
      while (inFlight.size > 0 && Date.now() < deadline) {
        await Promise.race([
          Promise.allSettled([...inFlight]),
          new Promise((resolve) => {
            setTimeout(resolve, Math.max(1, deadline - Date.now()));
          }),
        ]);
      }
    },
  };
  /* eslint-enable functional/no-let, functional/immutable-data */
};
