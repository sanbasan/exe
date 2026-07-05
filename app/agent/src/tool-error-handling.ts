import { reportServerError } from '@exe/server';

const TOOL_FAILURE_RESULT =
  'The tool call failed with an internal error and nothing was saved. Briefly tell the user this one did not get recorded, continue the conversation, and offer to retry once if it matters. Do not read technical details out loud.';

// Tool execute errors would otherwise surface to the model as an opaque
// "internal error" and never reach Sentry, so report them here and hand the
// model a recoverable instruction instead.
export const withToolErrorReporting =
  <Args, Opts>({
    execute,
    toolName,
  }: {
    readonly execute: (args: Args, opts: Opts) => Promise<string>;
    readonly toolName: string;
  }) =>
  async (args: Args, opts: Opts): Promise<string> => {
    /* eslint-disable-next-line functional/no-try-statements -- Boundary that converts tool failures into a model-readable result. */
    try {
      return await execute(args, opts);
    } catch (error: unknown) {
      void reportServerError({
        context: { route: `agent/tools/${toolName}` },
        error,
      });

      return TOOL_FAILURE_RESULT;
    }
  };
