import { agentConfig, isOpenAIRealtimeSpeed } from '#agent/config';
import { patchOpenAIRealtimePlugin } from '#agent/realtime-openai-patch';
import { StartSensitivity } from '@google/genai';
import type { llm } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as openai from '@livekit/agents-plugin-openai';

type GoogleRealtimeModelOptions = NonNullable<
  ConstructorParameters<typeof google.beta.realtime.RealtimeModel>[0]
>;

type OpenAIRealtimeModelOptions = NonNullable<
  ConstructorParameters<typeof openai.realtime.RealtimeModel>[0]
>;

type RealtimeConfig = typeof agentConfig.realtime;

const createGoogleRealtimeModelOptions = (): GoogleRealtimeModelOptions => {
  const { google: googleConfig } = agentConfig.realtime;
  const baseOptions = {
    model: googleConfig.model,
    realtimeInputConfig: {
      automaticActivityDetection: {
        prefixPaddingMs: 300,
        silenceDurationMs: 600,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
      },
    },
    voice: googleConfig.voice,
  } satisfies GoogleRealtimeModelOptions;

  if (googleConfig.useVertexAi) {
    return {
      ...baseOptions,
      vertexai: true,
    };
  }

  const { apiKey } = googleConfig;

  if (apiKey === undefined) {
    throw new Error(
      'GOOGLE_API_KEY or GEMINI_API_KEY is required when GOOGLE_GENAI_USE_VERTEXAI is not enabled.'
    );
  }

  return {
    ...baseOptions,
    apiKey,
    vertexai: false,
  };
};

const createOpenAIRealtimeModelOptions = (): OpenAIRealtimeModelOptions => {
  const { openai: openaiConfig } = agentConfig.realtime;
  const { apiKey } = openaiConfig;

  if (apiKey === undefined) {
    throw new Error(
      'OPENAI_API_KEY is required when REALTIME_PROVIDER=openai.'
    );
  }

  return {
    apiKey,
    model: openaiConfig.model,
    reasoning: {
      effort: openaiConfig.reasoningEffort,
    },
    speed: openaiConfig.speed,
    voice: openaiConfig.voice,
  };
};

export const assertRealtimeConfig = (
  realtimeConfig: RealtimeConfig = agentConfig.realtime
): void => {
  switch (realtimeConfig.provider) {
    case 'google':
      if (realtimeConfig.google.model.length === 0) {
        throw new Error('Gemini Live model is required.');
      }

      return;
    case 'openai':
      if (realtimeConfig.openai.model.length === 0) {
        throw new Error('OpenAI Realtime model is required.');
      }

      if (realtimeConfig.openai.apiKey === undefined) {
        throw new Error(
          'OPENAI_API_KEY is required when REALTIME_PROVIDER=openai.'
        );
      }

      if (!isOpenAIRealtimeSpeed(realtimeConfig.openai.speed)) {
        throw new Error(
          'OPENAI_REALTIME_SPEED must be a number between 0.25 and 1.5.'
        );
      }

      return;
  }
};

export const createRealtimeModel = (): llm.RealtimeModel => {
  switch (agentConfig.realtime.provider) {
    case 'google':
      return new google.beta.realtime.RealtimeModel(
        createGoogleRealtimeModelOptions()
      );
    case 'openai':
      patchOpenAIRealtimePlugin();

      return new openai.realtime.RealtimeModel(
        createOpenAIRealtimeModelOptions()
      );
  }
};
