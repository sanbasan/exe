import type { AssistantJobSnapshot } from '#agent/assistant/jobs';
import {
  executeToolCall,
  toFunctionDeclarations,
  type PlainToolSet,
} from '#agent/assistant/plain-tool';
import { generateContent } from '@exe/server';
import {
  FunctionCallingConfigMode,
  type Content,
  type FunctionCall,
  type Part,
} from '@google/genai';

// One-shot assistant (tool-caller) loop: the model receives the transcript of
// the call so far and NO written instruction — the voice agent only signals
// WHEN to act (and optionally which channel). The model determines what the
// user just asked for or confirmed from the transcript, works autonomously
// with plain tools, and returns a short textual report. It runs entirely off
// the voice path — the realtime conversation never waits on this loop.

export type GenerateContentFn = typeof generateContent;

const EMPTY_REPORT =
  'The assistant finished without producing a report. Treat the work as not completed.';

const WRAP_UP_MESSAGE =
  'Stop calling tools now. Summarize in the workspace language what you completed, what failed, and anything the user must be asked, as your final report.';

const extractText = (parts: readonly Part[]): string | null => {
  const text = parts
    .map((part) => part.text)
    .filter((value): value is string => typeof value === 'string')
    .join('')
    .trim();

  return text.length === 0 ? null : text;
};

const extractCalls = (parts: readonly Part[]): readonly FunctionCall[] =>
  parts
    .map((part) => part.functionCall)
    .filter((call): call is FunctionCall => call !== undefined);

const isArgsRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const runCallsSequentially = async ({
  calls,
  tools,
}: {
  readonly calls: readonly FunctionCall[];
  readonly tools: PlainToolSet;
}): Promise<readonly Part[]> => {
  const [call, ...rest] = calls;

  if (call === undefined) {
    return [];
  }

  const result = await executeToolCall({
    args: isArgsRecord(call.args) ? call.args : {},
    name: call.name ?? '',
    tools,
  });
  const part: Part = {
    functionResponse: {
      ...(call.id === undefined ? {} : { id: call.id }),
      name: call.name ?? '',
      response: { result },
    },
  };

  return [part, ...(await runCallsSequentially({ calls: rest, tools }))];
};

const runStep = async ({
  contents,
  declarations,
  generate,
  model,
  remainingSteps,
  systemPrompt,
  tools,
}: {
  readonly contents: readonly Content[];
  readonly declarations: ReturnType<typeof toFunctionDeclarations>;
  readonly generate: GenerateContentFn;
  readonly model: string;
  readonly remainingSteps: number;
  readonly systemPrompt: string;
  readonly tools: PlainToolSet;
}): Promise<string> => {
  const outOfSteps = remainingSteps <= 0;
  const response = await generate({
    config: { systemInstruction: systemPrompt },
    contents: outOfSteps
      ? [...contents, { parts: [{ text: WRAP_UP_MESSAGE }], role: 'user' }]
      : [...contents],
    model,
    ...(outOfSteps
      ? {
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
          },
        }
      : {}),
    tools: [{ functionDeclarations: [...declarations] }],
  });
  const content = response.candidates?.[0]?.content;
  const parts = content?.parts ?? [];
  const calls = extractCalls(parts);

  if (content === undefined || calls.length === 0 || outOfSteps) {
    return extractText(parts) ?? EMPTY_REPORT;
  }

  const responseParts = await runCallsSequentially({ calls, tools });

  return runStep({
    contents: [
      ...contents,
      content,
      { parts: [...responseParts], role: 'user' },
    ],
    declarations,
    generate,
    model,
    remainingSteps: remainingSteps - 1,
    systemPrompt,
    tools,
  });
};

const TRIGGER_INSTRUCTION = [
  'The voice agent triggered you at this point in the call, with NO written instruction — the conversation above IS the instruction.',
  "Read the transcript, focusing on its end: the voice agent triggers right after the user asks for or confirms something in natural conversation. The change lives in the USER'S OWN words spread over the recent turns — the agent only gives a brief acknowledgement, not a tidy restatement — so piece the action together from the flow of the conversation.",
  'Determine what that is and complete it: every action the user confirmed that is not already covered by a pending draft or an earlier background task, or the lookup the user is waiting on.',
  'If you cannot determine what to do, perform no destructive action and report the exact question to ask the user.',
].join(' ');

const formatPriorTask = (task: AssistantJobSnapshot): string =>
  task.report === undefined
    ? `${task.jobId} (${task.status})`
    : `${task.jobId} (${task.status}): ${task.report}`;

export const buildAssistantUserMessage = ({
  priorTasks = [],
  targetChannel,
  transcript,
  triggerInstruction = TRIGGER_INSTRUCTION,
}: {
  readonly priorTasks?: readonly AssistantJobSnapshot[];
  readonly targetChannel?: string;
  readonly transcript: string;
  readonly triggerInstruction?: string;
}): string =>
  [
    '## Conversation transcript so far',
    transcript,
    '',
    ...(priorTasks.length === 0
      ? []
      : [
          '## Earlier background tasks in this call (already handled — do not redo)',
          ...priorTasks.map(formatPriorTask),
          '',
        ]),
    ...(targetChannel === undefined
      ? []
      : ['## Target channel', targetChannel, '']),
    '## Your trigger',
    triggerInstruction,
  ].join('\n');

export const runAssistantAgent = ({
  generate = generateContent,
  maxSteps,
  model,
  priorTasks,
  systemPrompt,
  targetChannel,
  tools,
  transcript,
  triggerInstruction,
}: {
  readonly generate?: GenerateContentFn;
  readonly maxSteps: number;
  readonly model: string;
  readonly priorTasks?: readonly AssistantJobSnapshot[];
  readonly systemPrompt: string;
  readonly targetChannel?: string;
  readonly tools: PlainToolSet;
  readonly transcript: string;
  // Overrides the default "act on what the user just confirmed" trigger, so
  // special-purpose runs (e.g. the memory scout) can reuse this loop.
  readonly triggerInstruction?: string;
}): Promise<string> =>
  runStep({
    contents: [
      {
        parts: [
          {
            text: buildAssistantUserMessage({
              ...(priorTasks === undefined ? {} : { priorTasks }),
              ...(targetChannel === undefined ? {} : { targetChannel }),
              transcript,
              ...(triggerInstruction === undefined
                ? {}
                : { triggerInstruction }),
            }),
          },
        ],
        role: 'user',
      },
    ],
    declarations: toFunctionDeclarations(tools),
    generate,
    model,
    remainingSteps: maxSteps,
    systemPrompt,
    tools,
  });
