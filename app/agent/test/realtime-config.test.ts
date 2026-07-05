import type { agentConfig } from '#agent/config';
import { assertRealtimeConfig } from '#agent/realtime-model';
import assert from 'node:assert/strict';
import { test } from 'node:test';

type RealtimeConfig = (typeof agentConfig)['realtime'];

const baseRealtimeConfig: RealtimeConfig = {
  google: {
    apiKey: 'gemini-test-key',
    model: 'gemini-3.1-flash-live-preview',
    useVertexAi: false,
    voice: 'Aoede',
  },
  openai: {
    apiKey: 'openai-test-key',
    model: 'gpt-realtime-2',
    reasoningEffort: 'medium',
    speed: 1.2,
    voice: 'marin',
  },
  provider: 'google',
};

const openAIRealtimeConfigWithSpeed = (speed: number): RealtimeConfig => ({
  ...baseRealtimeConfig,
  openai: {
    ...baseRealtimeConfig.openai,
    speed,
  },
  provider: 'openai',
});

void test('google realtime provider does not require OPENAI_API_KEY', () => {
  assert.doesNotThrow(() => {
    assertRealtimeConfig({
      ...baseRealtimeConfig,
      openai: {
        ...baseRealtimeConfig.openai,
        apiKey: undefined,
      },
      provider: 'google',
    });
  });
});

void test('openai realtime provider requires OPENAI_API_KEY', () => {
  assert.throws(
    () => {
      assertRealtimeConfig({
        ...baseRealtimeConfig,
        openai: {
          ...baseRealtimeConfig.openai,
          apiKey: undefined,
        },
        provider: 'openai',
      });
    },
    {
      message: 'OPENAI_API_KEY is required when REALTIME_PROVIDER=openai.',
    }
  );
});

void test('openai realtime provider accepts an explicit OPENAI_API_KEY', () => {
  assert.doesNotThrow(() => {
    assertRealtimeConfig({
      ...baseRealtimeConfig,
      provider: 'openai',
    });
  });
});

void test('openai realtime provider accepts default speed', () => {
  assert.doesNotThrow(() => {
    assertRealtimeConfig(openAIRealtimeConfigWithSpeed(1.2));
  });
});

void test('openai realtime provider accepts minimum speed', () => {
  assert.doesNotThrow(() => {
    assertRealtimeConfig(openAIRealtimeConfigWithSpeed(0.25));
  });
});

void test('openai realtime provider accepts maximum speed', () => {
  assert.doesNotThrow(() => {
    assertRealtimeConfig(openAIRealtimeConfigWithSpeed(1.5));
  });
});

void test('openai realtime provider rejects zero speed', () => {
  assert.throws(
    () => {
      assertRealtimeConfig(openAIRealtimeConfigWithSpeed(0));
    },
    {
      message: 'OPENAI_REALTIME_SPEED must be a number between 0.25 and 1.5.',
    }
  );
});

void test('openai realtime provider rejects too-fast speed', () => {
  assert.throws(
    () => {
      assertRealtimeConfig(openAIRealtimeConfigWithSpeed(1.51));
    },
    {
      message: 'OPENAI_REALTIME_SPEED must be a number between 0.25 and 1.5.',
    }
  );
});

void test('openai realtime provider rejects non-numeric speed', () => {
  assert.throws(
    () => {
      assertRealtimeConfig(openAIRealtimeConfigWithSpeed(Number.NaN));
    },
    {
      message: 'OPENAI_REALTIME_SPEED must be a number between 0.25 and 1.5.',
    }
  );
});
