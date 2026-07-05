import { reportServerError } from '@exe/server';
import type { FunctionDeclaration } from '@google/genai';
import { z } from 'zod';

// Plain tools are the assistant (tool-caller) agent's tool surface: ordinary
// async functions with zod-validated arguments, executed synchronously inside
// the assistant's own reasoning loop. Unlike the voice agent's LiveKit tools
// they never touch the realtime session, so slow work (prose composition,
// GBrain round-trips) simply awaits here without blocking any conversation.

/* eslint-disable-next-line functional/no-mixed-types -- A tool is inherently metadata (description, schema) plus its execute function. */
export interface PlainTool {
  readonly description: string;
  readonly execute: (args: Record<string, unknown>) => Promise<string>;
  readonly parameters?: z.ZodType;
}

export type PlainToolSet = Readonly<Record<string, PlainTool>>;

const TOOL_FAILURE_RESULT =
  'The tool call failed with an internal error and nothing was saved. Do not retry more than once; if it keeps failing, report the failure in your final answer.';

// The Gemini API accepts standard JSON Schema but rejects the "$schema"
// marker zod emits, so strip it.
const toParametersJsonSchema = (schema: z.ZodType): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(z.toJSONSchema(schema, { io: 'input' })).filter(
      ([key]) => key !== '$schema'
    )
  );

export const toFunctionDeclarations = (
  tools: PlainToolSet
): readonly FunctionDeclaration[] =>
  Object.entries(tools).map(([name, tool]) => ({
    description: tool.description,
    name,
    ...(tool.parameters === undefined
      ? {}
      : { parametersJsonSchema: toParametersJsonSchema(tool.parameters) }),
  }));

const formatIssuePath = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '(root)' : path.map(String).join('.');

const formatArgsIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join('; ');

// Executes one function call from the model defensively: unknown tool names,
// invalid arguments, and thrown errors all come back as model-readable result
// strings so the assistant loop can correct course instead of crashing.
export const executeToolCall = async ({
  args,
  name,
  tools,
}: {
  readonly args: Record<string, unknown>;
  readonly name: string;
  readonly tools: PlainToolSet;
}): Promise<string> => {
  const tool = Object.entries(tools).find(([key]) => key === name)?.[1];

  if (tool === undefined) {
    return `Unknown tool "${name}". Use only the declared tools.`;
  }

  if (tool.parameters !== undefined) {
    const parsed = tool.parameters.safeParse(args);

    if (!parsed.success) {
      return `Invalid arguments for "${name}": ${formatArgsIssues(parsed.error)}. Fix the arguments and call the tool again.`;
    }
  }

  /* eslint-disable-next-line functional/no-try-statements -- Boundary that converts tool failures into a model-readable result. */
  try {
    return await tool.execute(args);
  } catch (error: unknown) {
    void reportServerError({
      context: { route: `agent/assistant/tools/${name}` },
      error,
    });

    return TOOL_FAILURE_RESULT;
  }
};
