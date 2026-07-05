import { getRequiredConfigValue, serverConfig } from '#server/config';
import { runWithModelFallback } from './retry';
import {
  ApiError,
  GoogleGenAI,
  type ContentListUnion,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type ToolConfig,
  type ToolListUnion,
} from '@google/genai';

const getClient = (): GoogleGenAI =>
  new GoogleGenAI({
    apiKey: getRequiredConfigValue({
      label: 'GEMINI_API_KEY',
      ...(serverConfig.gemini.apiKey === undefined
        ? {}
        : { value: serverConfig.gemini.apiKey }),
    }),
  });

const transientStatuses: ReadonlySet<number> = new Set([429, 503]);

const isTransientApiError = (error: unknown): boolean =>
  error instanceof ApiError && transientStatuses.has(error.status);

export const generateContent = ({
  config,
  contents,
  model,
  toolConfig,
  tools,
}: {
  readonly config?: GenerateContentConfig;
  readonly contents: ContentListUnion;
  readonly model?: string;
  readonly toolConfig?: ToolConfig;
  readonly tools?: ToolListUnion;
}): Promise<GenerateContentResponse> =>
  runWithModelFallback({
    isTransient: isTransientApiError,
    models: [
      model ?? serverConfig.gemini.model,
      serverConfig.gemini.fallbackModel,
    ],
    onFallback: (fallbackModel) => {
      process.stderr.write(
        `${JSON.stringify({
          level: 'warn',
          message: `Gemini model unavailable after retries; falling back to ${fallbackModel}`,
        })}\n`
      );
    },
    run: (resolvedModel) =>
      getClient().models.generateContent({
        config: {
          ...(config ?? {}),
          ...(toolConfig === undefined ? {} : { toolConfig }),
          ...(tools === undefined ? {} : { tools }),
        },
        contents,
        model: resolvedModel,
      }),
  });
