import type { LatestInfoGenerateContent } from '../src/services/channel-latest-info-synthesizer';
import { createMeetingComposer } from '../src/services/meeting-composer';
import { FinishReason } from '@google/genai';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const MODEL = 'gemini-2.5-flash';

interface FakeResponse {
  readonly finishReason?: FinishReason;
  readonly text?: string;
}

// Reading shape for a recorded generate() call. Test files sit outside the
// package tsconfig, so these casts are runtime-only (tsx strips types) and
// only used to inspect the params the composer sent.
interface RecordedPart {
  readonly text?: string;
}

interface RecordedContent {
  readonly parts: readonly RecordedPart[];
  readonly role?: string;
}

interface RecordedCall {
  readonly config?: {
    readonly maxOutputTokens?: number;
    readonly responseMimeType?: string;
  };
  readonly contents: readonly RecordedContent[];
  readonly model: string;
}

const createFakeGenerate = (
  responses: readonly FakeResponse[]
): {
  readonly calls: unknown[];
  readonly generate: LatestInfoGenerateContent;
} => {
  const queue = [...responses];
  const calls: unknown[] = [];
  const generate: LatestInfoGenerateContent = (params) => {
    calls.push(params);

    const next = queue.shift();

    if (next === undefined) {
      assert.fail('generate called more times than responses were queued.');
    }

    return Promise.resolve({
      ...(next.finishReason === undefined
        ? {}
        : { candidates: [{ finishReason: next.finishReason }] }),
      ...(next.text === undefined ? {} : { text: next.text }),
    });
  };

  return { calls, generate };
};

void test('transcribeRecording: single STOP round then notes returns the merged transcription', async () => {
  const { calls, generate } = createFakeGenerate([
    { finishReason: FinishReason.STOP, text: 'Speaker 1: hello' },
    {
      finishReason: FinishReason.STOP,
      text: '{"title":"Weekly Sync","overview":"o","keyPoints":["k"],"decisions":["d"]}',
    },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  const result = await composer.transcribeRecording({
    audioBase64: 'AUDIO',
    language: 'en',
    mimeType: 'audio/mp4',
  });

  assert.deepEqual(result, {
    decisions: ['d'],
    keyPoints: ['k'],
    overview: 'o',
    title: 'Weekly Sync',
    transcript: 'Speaker 1: hello',
  });
  assert.equal(calls.length, 2);

  const transcriptCall = calls[0] as RecordedCall;
  const notesCall = calls[1] as RecordedCall;

  assert.equal(transcriptCall.model, MODEL);
  assert.equal(transcriptCall.config?.responseMimeType, undefined);
  assert.equal(notesCall.config?.responseMimeType, 'application/json');
  assert.equal(notesCall.contents[0]?.parts[0]?.text, 'Speaker 1: hello');
});

void test('transcribeRecording: MAX_TOKENS continues the transcript across calls', async () => {
  const { calls, generate } = createFakeGenerate([
    { finishReason: FinishReason.MAX_TOKENS, text: 'line1' },
    { finishReason: FinishReason.STOP, text: 'line2' },
    { finishReason: FinishReason.STOP, text: '{"title":"T"}' },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  const result = await composer.transcribeRecording({
    audioBase64: 'AUDIO',
    language: 'en',
    mimeType: 'audio/mp4',
  });

  assert.equal(result.transcript, 'line1\nline2');
  assert.equal(calls.length, 3);

  const secondCall = calls[1] as RecordedCall;

  // Continuation turn: prior transcript replayed as a model turn, followed by
  // a user continuation prompt.
  assert.equal(secondCall.contents[1]?.role, 'model');
  assert.equal(secondCall.contents[1]?.parts[0]?.text, 'line1');
  assert.equal(secondCall.contents[2]?.role, 'user');
  assert.match(secondCall.contents[2]?.parts[0]?.text ?? '', /cut off/u);
});

void test('transcribeRecording: stops after the continuation cap without throwing', async () => {
  // The cap is 20 continuations, so the transcript stage makes 21 calls
  // (initial + 20). A 22nd (notes) call follows. Queue exactly that many
  // responses so the FIFO fake stays in sync.
  const truncatedRounds: readonly FakeResponse[] = Array.from(
    { length: 21 },
    (_unused, index) => ({
      finishReason: FinishReason.MAX_TOKENS,
      text: `c${index}`,
    })
  );
  const { calls, generate } = createFakeGenerate([
    ...truncatedRounds,
    { finishReason: FinishReason.STOP, text: '{"title":"Capped"}' },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  const result = await composer.transcribeRecording({
    audioBase64: 'AUDIO',
    language: 'en',
    mimeType: 'audio/mp4',
  });

  assert.equal(result.title, 'Capped');
  assert.equal(
    result.transcript,
    Array.from({ length: 21 }, (_unused, index) => `c${index}`).join('\n')
  );
  assert.equal(calls.length, 22);

  const transcriptCalls = calls.filter(
    (call) => (call as RecordedCall).config?.responseMimeType === undefined
  );
  const notesCalls = calls.filter(
    (call) =>
      (call as RecordedCall).config?.responseMimeType === 'application/json'
  );

  assert.equal(transcriptCalls.length, 21);
  assert.equal(notesCalls.length, 1);
});

void test('transcribeRecording: throws on an empty transcript and skips the notes call', async () => {
  const { calls, generate } = createFakeGenerate([
    { finishReason: FinishReason.STOP, text: '' },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  await assert.rejects(
    composer.transcribeRecording({
      audioBase64: 'AUDIO',
      language: 'en',
      mimeType: 'audio/mp4',
    }),
    (error: unknown) =>
      error instanceof Error && error.message.includes('Model returned no text')
  );
  assert.equal(calls.length, 1);
});

void test('transcribeRecording: surfaces a notes JSON parse failure', async () => {
  const { calls, generate } = createFakeGenerate([
    { finishReason: FinishReason.STOP, text: 'Speaker 1: hi' },
    { finishReason: FinishReason.STOP, text: '{"title":"broken"' },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  await assert.rejects(
    composer.transcribeRecording({
      audioBase64: 'AUDIO',
      language: 'en',
      mimeType: 'audio/mp4',
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('Failed to parse model response')
  );
  assert.equal(calls.length, 2);
});

void test('extractOperations: parses valid JSON and uses the 65536-token budget', async () => {
  const { calls, generate } = createFakeGenerate([
    {
      finishReason: FinishReason.STOP,
      text: '{"creates":[],"dependencies":[],"updates":[]}',
    },
  ]);
  const composer = createMeetingComposer({ generate, model: MODEL });

  const result = await composer.extractOperations({
    channels: [],
    language: 'en',
    members: [],
    now: '2026-07-01T00:00:00.000Z',
    tasks: [],
    timezone: 'Asia/Tokyo',
    transcript: 'Speaker 1: hello',
  });

  assert.deepEqual(result, { creates: [], dependencies: [], updates: [] });
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as RecordedCall).config?.maxOutputTokens, 65536);
});
