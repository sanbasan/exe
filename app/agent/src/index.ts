import { agentConfig } from '#agent/config';
import { rejectWhenWorkerIsFull } from '#agent/job-capacity';
import { assertRealtimeConfig } from '#agent/realtime-model';
import { handleSession } from '#agent/session-handler';
import { reportServerError } from '@exe/server';
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
} from '@livekit/agents';
import { fileURLToPath } from 'node:url';

const reportAgentError = ({
  error,
  route,
}: {
  readonly error: unknown;
  readonly route: string;
}): Promise<void> =>
  reportServerError({
    context: { route },
    error,
  });

const handleAgentSession = (ctx: JobContext): Promise<void> =>
  handleSession(ctx).catch(async (error: unknown): Promise<never> => {
    await reportAgentError({
      error,
      route: 'agent/livekit/session',
    });
    throw error;
  });

const reportFatalAgentError = ({
  error,
  route,
}: {
  readonly error: unknown;
  readonly route: string;
}): void => {
  void reportAgentError({ error, route }).finally(() => {
    process.exit(1);
  });
};

process.on('uncaughtException', (error: Error): void => {
  reportFatalAgentError({
    error,
    route: 'agent/livekit/uncaught_exception',
  });
});

process.on('unhandledRejection', (error: unknown): void => {
  reportFatalAgentError({
    error,
    route: 'agent/livekit/unhandled_rejection',
  });
});

export default defineAgent({
  entry: (ctx: JobContext): Promise<void> => handleAgentSession(ctx),
  prewarm: (): void => {
    // Validate and initialize static model configuration while idle processes
    // are being prepared, so the first accepted job does less work on path.
    assertRealtimeConfig();
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: agentConfig.livekit.agentName,
    initializeProcessTimeout: agentConfig.worker.initializeProcessTimeoutMs,
    loadThreshold: agentConfig.worker.loadThreshold,
    numIdleProcesses: agentConfig.worker.numIdleProcesses,
    requestFunc: rejectWhenWorkerIsFull,
  })
);
