import { generateContent } from '#server/infrastructure';
import { reportServerError } from '#server/utils';
import { FunctionCallingConfigMode, Type, type Tool } from '@google/genai';
import { z } from 'zod';

export const extractedTaskInfoSchema = z
  .object({
    assigneeSlackUserId: z.string().optional(),
    dueAt: z.string().optional(),
    title: z.string(),
  })
  .strict();

export type ExtractedTaskInfo = z.infer<typeof extractedTaskInfoSchema>;

const extractTaskInfoTool: Tool = {
  functionDeclarations: [
    {
      description: 'Extract task information from the conversation.',
      name: 'extract_task_info',
      parameters: {
        properties: {
          assigneeSlackUserId: {
            description:
              'The Slack User ID of the person assigned to the task.',
            type: Type.STRING,
          },
          dueAt: {
            description:
              'Due date and time of the task in ISO 8601 format WITHOUT timezone offset (e.g., 2026-02-05T18:00:00). The time should be in the same timezone as the conversation context. Round the time to the nearest 30-minute increment.',
            type: Type.STRING,
          },
          title: {
            description:
              'A short action-oriented task title. Do not copy status reports or completion notes; describe the requested work with a verb, follow the prompt language policy, and include attachment filenames only when they identify the work target. Never include deadline expressions (e.g. "金曜までに", "by Friday") in the title; put the deadline in dueAt instead.',
            type: Type.STRING,
          },
        },
        required: ['title'],
        type: Type.OBJECT,
      },
    },
  ],
};

export const callGeminiTaskExtraction = async (
  prompt: string
): Promise<ExtractedTaskInfo | null> => {
  const response = await generateContent({
    contents: [{ parts: [{ text: prompt }], role: 'user' }],
    toolConfig: {
      functionCallingConfig: {
        allowedFunctionNames: ['extract_task_info'],
        mode: FunctionCallingConfigMode.ANY,
      },
    },
    tools: [extractTaskInfoTool],
  }).catch(async (error: unknown) => {
    // Degrade to the existing null path so the user gets the "couldn't
    // create a task" reply instead of a silent failure.
    await reportServerError({
      context: { route: 'slack/task-creation.gemini' },
      error,
    });

    return null;
  });

  if (response === null) {
    return null;
  }

  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts;

  if (parts === undefined) {
    return null;
  }

  const functionCallPart = parts.find(
    (part) => part.functionCall !== undefined
  );
  const args = functionCallPart?.functionCall?.args;

  if (args === undefined) {
    return null;
  }

  const parseResult = extractedTaskInfoSchema.safeParse(args);

  return parseResult.success ? parseResult.data : null;
};
