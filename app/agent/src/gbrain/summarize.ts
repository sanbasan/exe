import type { CallEvent, Language } from '@exe/domain';
import { buildCallTranscript, generateContent } from '@exe/server';
import { Type, type GenerateContentConfig } from '@google/genai';

// Gemini-composed page title + semantic summary for a call's GBrain page. The
// deterministic slug-derived title and the in-call summary event are poor page
// headers, so this writes a concise topic title and a written-prose summary
// from the transcript. Best-effort: returns null when there is no transcript,
// when the model output is unusable, or (via the caller's catch) when the API
// call throws.

export interface ComposedCallPageSummary {
  readonly summary: string;
  readonly title: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalize = (text: string): string => text.replace(/\s+/gu, ' ').trim();

const buildSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたは音声通話の文字起こしから、記録用の文章を書き起こすライターです。',
        '日本語だけで書いてください。',
        '会話の口語表現をそのまま写さず、簡潔な書き言葉に整えてください。',
        'title は通話の主題が一目で分かる具体的な一文(おおよそ40文字以内)にしてください。参加者名や日付は入れず、何について話したかを書いてください。',
        'summary は会話の要点と決定事項を1〜3文の書き言葉でまとめてください。',
        '出力は {"summary":"...","title":"..."} のJSONだけにしてください。',
      ]
    : [
        'You are a writer who turns a voice-call transcript into text for the record.',
        'Write only in English.',
        'Rewrite spoken phrasing into concise written prose; never copy filler words.',
        'Identify the main topic and write title as one concise phrase (roughly 60 characters) that states what the call was about. Do not include participant names or dates.',
        'Write summary as one to three written sentences covering the key points and decisions.',
        'Return only JSON in the shape {"summary":"...","title":"..."}.',
      ]
  ).join('\n');

const parseSummary = (text?: string): ComposedCallPageSummary | null => {
  if (text === undefined) {
    return null;
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    const parsed: unknown = JSON.parse(text);

    if (!isRecord(parsed)) {
      return null;
    }

    const { summary, title } = parsed;

    if (typeof summary !== 'string' || typeof title !== 'string') {
      return null;
    }

    const normalizedSummary = normalize(summary);
    const normalizedTitle = normalize(title);

    return normalizedSummary.length === 0 || normalizedTitle.length === 0
      ? null
      : { summary: normalizedSummary, title: normalizedTitle };
  } catch (error: unknown) {
    void error;

    return null;
  }
  /* eslint-enable functional/no-try-statements */
};

export const summarizeCallForPage = async ({
  channelNames,
  decisionLines,
  events,
  language,
  participantName,
  purpose,
}: {
  readonly channelNames: readonly string[];
  readonly decisionLines: readonly string[];
  readonly events: readonly CallEvent[];
  readonly language: Language;
  readonly participantName?: string;
  readonly purpose: string;
}): Promise<ComposedCallPageSummary | null> => {
  const transcript = buildCallTranscript({
    events,
    ...(participantName === undefined ? {} : { speakerName: participantName }),
  });

  if (transcript.length === 0) {
    return null;
  }

  const config: GenerateContentConfig = {
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
    responseSchema: {
      properties: {
        summary: {
          description:
            'One to three written sentences covering the key points and decisions.',
          type: Type.STRING,
        },
        title: {
          description:
            'One concise phrase stating what the call was about, no names or dates.',
          type: Type.STRING,
        },
      },
      required: ['summary', 'title'],
      type: Type.OBJECT,
    },
    systemInstruction: buildSystemInstruction(language),
    temperature: 0.2,
  };

  const input = {
    ...(channelNames.length === 0 ? {} : { channelNames }),
    conversationTranscript: transcript,
    ...(decisionLines.length === 0
      ? {}
      : { decisions: decisionLines.join('\n') }),
    purpose,
    workspaceLanguage: language,
  };

  const response = await generateContent({
    config,
    contents: [
      { parts: [{ text: JSON.stringify(input, null, 2) }], role: 'user' },
    ],
  });

  return parseSummary(response.text);
};
