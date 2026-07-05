/* eslint-disable max-lines -- The per-kind writer instructions and compose methods are kept together so in-call prose behavior is reviewed in one place. */
import { notFoundError } from '#server/errors';
import type {
  CallEventRepository,
  ChannelRepository,
  WorkspaceRepository,
} from '#server/ports';
import { buildCallTranscript } from '#server/services/call-transcript';
import type { LatestInfoGenerateContent } from '#server/services/channel-latest-info-synthesizer';
import type { Language } from '@exe/domain';
import { Type, type GenerateContentConfig, type Schema } from '@google/genai';
import { z } from 'zod';

// In-call prose writer: the realtime voice agent must not author prose in
// tool arguments (silence while generating), so each tool passes only ids and
// a short hint, and this composer writes the actual text from the call
// transcript in the background.

export interface ComposedFollowUpTask {
  readonly followUpQuestion: string;
  readonly title: string;
}

export interface ComposedFollowUpAnswer {
  readonly answer: string;
}

export interface ComposedWorkTaskTitle {
  readonly title: string;
}

export interface ComposedWorkTaskPatch {
  readonly reason?: string;
  readonly title?: string;
}

export interface ComposedChannelReview {
  readonly lastSelfReport?: string;
  readonly statusText: string;
}

export interface CallProseComposer {
  readonly composeChannelReview: (params: {
    readonly callSessionId: string;
    readonly channelId: string;
    readonly hint?: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) => Promise<ComposedChannelReview | null>;
  readonly composeFollowUpAnswer: (params: {
    readonly callSessionId: string;
    readonly followUpQuestion: string;
    readonly hint?: string;
    readonly speakerName?: string;
    readonly taskTitle: string;
    readonly workspaceId: string;
  }) => Promise<ComposedFollowUpAnswer | null>;
  readonly composeFollowUpTask: (params: {
    readonly callSessionId: string;
    readonly hint: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) => Promise<ComposedFollowUpTask | null>;
  readonly composeWorkTaskPatch: (params: {
    readonly callSessionId: string;
    readonly changeSummary: string;
    readonly hint?: string;
    readonly speakerName?: string;
    readonly taskTitle: string;
    readonly titleHint?: string;
    readonly workspaceId: string;
  }) => Promise<ComposedWorkTaskPatch | null>;
  readonly composeWorkTaskTitle: (params: {
    readonly callSessionId: string;
    readonly hint: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) => Promise<ComposedWorkTaskTitle | null>;
}

const sharedWriterRules = (language: Language): readonly string[] =>
  language === 'ja'
    ? [
        'あなたは音声通話の文字起こしから、記録用の文章を書き起こすライターです。',
        'workspace languageである日本語だけで書いてください。',
        '会話の口語表現をそのまま写さず、簡潔な書き言葉に整えてください。',
        'hint は通話中のアシスタントが残した短い手掛かりです。会話の内容と矛盾する場合は会話を優先してください。',
        '出力は指定された形のJSONだけにしてください。',
      ]
    : [
        'You are a writer who turns a voice-call transcript into text for the record.',
        'Write only in the workspace language, English.',
        'Rewrite spoken phrasing into concise written prose; never copy filler words.',
        'The hint is a short cue left by the in-call assistant. When it conflicts with the conversation, trust the conversation.',
        'Return only JSON in the requested shape.',
      ];

const workTaskTitleInstruction = (language: Language): string =>
  [
    ...sharedWriterRules(language),
    ...(language === 'ja'
      ? [
          'ユーザーが作成を依頼した作業タスクを会話から特定し、そのタイトルを1つ書いてください。',
          'タイトルは具体的な作業内容が分かる簡潔な一文（おおよそ40文字以内）にしてください。',
          '期限は別フィールドで管理されるため、"金曜までに" のような期限表現はタイトルに含めないでください。',
          '出力は {"title":"..."} のJSONだけにしてください。',
        ]
      : [
          'Identify the work task the user asked to create and write its title.',
          'Keep the title one concise phrase (roughly 60 characters) that states the concrete work.',
          'The due date is tracked in a separate field, so never include deadline expressions such as "by Friday" in the title.',
          'Return only JSON in the shape {"title":"..."}.',
        ]),
  ].join('\n');

const followUpTaskInstruction = (language: Language): string =>
  [
    ...sharedWriterRules(language),
    ...(language === 'ja'
      ? [
          'ユーザーが他の人に確認したい事項（フォローアップ）を会話から特定してください。',
          'title はその確認事項の簡潔なタイトル（おおよそ40文字以内）、followUpQuestion は相手にそのまま尋ねられる具体的な質問文（1〜2文）にしてください。',
          '出力は {"followUpQuestion":"...","title":"..."} のJSONだけにしてください。',
        ]
      : [
          'Identify what the user wants to confirm with another person (the follow-up).',
          'Write title as a concise label (roughly 60 characters) and followUpQuestion as the concrete question (one or two sentences) that can be asked as-is.',
          'Return only JSON in the shape {"followUpQuestion":"...","title":"..."}.',
        ]),
  ].join('\n');

const followUpAnswerInstruction = (language: Language): string =>
  [
    ...sharedWriterRules(language),
    ...(language === 'ja'
      ? [
          '入力に示されたフォローアップタスクへの回答が会話中で述べられています。',
          '回答の内容を1〜3文の書き言葉でまとめて answer に書いてください。回答した本人の言い分をそのまま記録する趣旨です。',
          '出力は {"answer":"..."} のJSONだけにしてください。',
        ]
      : [
          'The conversation contains the answer to the follow-up task shown in the input.',
          'Summarize that answer in one to three written sentences as answer, recording what the person actually said.',
          'Return only JSON in the shape {"answer":"..."}.',
        ]),
  ].join('\n');

const workTaskPatchInstruction = (language: Language): string =>
  [
    ...sharedWriterRules(language),
    ...(language === 'ja'
      ? [
          '入力に示されたタスクへの変更（changeSummary）が会話中で合意されています。',
          'reason には、ユーザーが述べた変更理由を1文で書いてください。理由が会話で述べられていない場合は空文字にしてください。',
          'titleHint が入力にある場合のみ、新しいタスクタイトルを title に書いてください。それ以外は title を空文字にしてください。',
          '出力は {"reason":"...","title":"..."} のJSONだけにしてください。',
        ]
      : [
          'The conversation agreed on the task change shown in the input (changeSummary).',
          'Write reason as one sentence stating the reason the user gave; leave it as an empty string when no reason was stated.',
          'Write title as the new task title only when the input contains titleHint; otherwise leave title as an empty string.',
          'Return only JSON in the shape {"reason":"...","title":"..."}.',
        ]),
  ].join('\n');

const channelReviewInstruction = (language: Language): string =>
  [
    ...sharedWriterRules(language),
    ...(language === 'ja'
      ? [
          '入力に示されたSlackチャンネルについて、通話でのチャンネルチェックの結果を書き起こしてください。',
          'statusText には、既存のlatest infoと会話内容を統合したチャンネルの現在状況を、進捗とブロックを中心に1段落の自然文で書いてください。見出し、箇条書き、ラベル分割、次回確認予定、タスク詳細の羅列は禁止です。矛盾する場合は新しい発言を優先してください。',
          'statusText は全体で2〜3文、150字以内に収めてください。細部を網羅せず、現在の状態を判断するのに必要な要点だけに絞ってください。',
          'lastSelfReport には、この人が前回チェック以降にこのチャンネルでやったと報告した内容を1〜2文で書いてください。会話で述べられていない場合は空文字にしてください。',
          '出力は {"lastSelfReport":"...","statusText":"..."} のJSONだけにしてください。',
        ]
      : [
          'Write up the result of the channel check for the Slack channel shown in the input.',
          'Write statusText as one natural paragraph of the channel current state, integrating the existing latest info with the conversation, focused on progress and blocks. Do not use headings, bullet points, labeled sections, next-check timing, or task-detail lists. Prefer newer statements when they conflict.',
          'Keep statusText to two or three sentences (about 60 words). Do not enumerate details; keep only the essentials needed to judge the current state.',
          'Write lastSelfReport as one or two sentences of what the person reported having done on this channel since the last check; leave it as an empty string when nothing was reported.',
          'Return only JSON in the shape {"lastSelfReport":"...","statusText":"..."}.',
        ]),
  ].join('\n');

const stringProperty = (description: string): Schema => ({
  description,
  type: Type.STRING,
});

const buildConfig = ({
  properties,
  required,
  systemInstruction,
}: {
  readonly properties: Readonly<Record<string, Schema>>;
  readonly required: readonly string[];
  readonly systemInstruction: string;
}): GenerateContentConfig => ({
  // Thought tokens count toward maxOutputTokens; disable thinking so long
  // transcripts cannot exhaust the budget before any text is produced. See
  // call-latest-info-composer.ts for the incident details.
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: { ...properties },
    required: [...required],
    type: Type.OBJECT,
  },
  systemInstruction,
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const normalizeProse = (text: string): string =>
  text.replace(/\s+/gu, ' ').trim();

// Gemini structured output cannot express optional fields reliably, so
// optional prose comes back as an empty string and is dropped here.
const optionalProse = (text: string): string | undefined => {
  const normalized = normalizeProse(text);

  return normalized.length === 0 ? undefined : normalized;
};

const parseJsonOutput = <T>({
  schema,
  text,
}: {
  readonly schema: z.ZodType<T>;
  readonly text?: string;
}): T | null => {
  if (text === undefined) {
    return null;
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    const result = schema.safeParse(JSON.parse(text));

    return result.success ? result.data : null;
  } catch (error: unknown) {
    void error;

    return null;
  }
  /* eslint-enable functional/no-try-statements */
};

const workTaskTitleOutputSchema = z.object({ title: z.string() }).strip();

const followUpTaskOutputSchema = z
  .object({ followUpQuestion: z.string(), title: z.string() })
  .strip();

const followUpAnswerOutputSchema = z.object({ answer: z.string() }).strip();

const workTaskPatchOutputSchema = z
  .object({ reason: z.string().optional(), title: z.string().optional() })
  .strip();

const channelReviewOutputSchema = z
  .object({ lastSelfReport: z.string().optional(), statusText: z.string() })
  .strip();

export const createCallProseComposer = ({
  callEventRepository,
  channelRepository,
  generate,
  model,
  workspaceRepository,
}: {
  readonly callEventRepository: Pick<
    CallEventRepository,
    'listByCallSessionId'
  >;
  readonly channelRepository: Pick<ChannelRepository, 'getById'>;
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
  readonly workspaceRepository: Pick<WorkspaceRepository, 'getById'>;
}): CallProseComposer => {
  const loadTranscriptAndLanguage = async ({
    callSessionId,
    speakerName,
    workspaceId,
  }: {
    readonly callSessionId: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }): Promise<{
    readonly language: Language;
    readonly transcript: string;
  } | null> => {
    const [workspace, events] = await Promise.all([
      workspaceRepository.getById({ workspaceId }),
      callEventRepository.listByCallSessionId({ callSessionId, workspaceId }),
    ]);

    if (workspace === null) {
      throw notFoundError(`Workspace ${workspaceId} was not found.`);
    }

    const transcript = buildCallTranscript({
      events,
      ...(speakerName === undefined ? {} : { speakerName }),
    });

    return transcript.length === 0
      ? null
      : { language: workspace.language, transcript };
  };

  const generateJson = async <T>({
    config,
    input,
    schema,
  }: {
    readonly config: GenerateContentConfig;
    readonly input: Readonly<Record<string, unknown>>;
    readonly schema: z.ZodType<T>;
  }): Promise<T | null> => {
    const response = await generate({
      config,
      contents: [
        { parts: [{ text: JSON.stringify(input, null, 2) }], role: 'user' },
      ],
      model,
    });

    return parseJsonOutput({
      schema,
      ...(response.text === undefined ? {} : { text: response.text }),
    });
  };

  return {
    composeChannelReview: async ({
      callSessionId,
      channelId,
      hint,
      speakerName,
      workspaceId,
    }): Promise<ComposedChannelReview | null> => {
      const [loaded, channel] = await Promise.all([
        loadTranscriptAndLanguage({
          callSessionId,
          ...(speakerName === undefined ? {} : { speakerName }),
          workspaceId,
        }),
        channelRepository.getById({ channelId, workspaceId }),
      ]);

      if (channel === null) {
        throw notFoundError(`Channel ${channelId} was not found.`);
      }

      if (loaded === null) {
        return null;
      }

      const output = await generateJson({
        config: buildConfig({
          properties: {
            lastSelfReport: stringProperty(
              'One or two sentences of the self report; empty string when none was stated.'
            ),
            statusText: stringProperty('One paragraph channel current state.'),
          },
          required: ['lastSelfReport', 'statusText'],
          systemInstruction: channelReviewInstruction(loaded.language),
        }),
        input: {
          channel: {
            existingLatestInfo: channel.latestInfo ?? null,
            name: channel.name,
          },
          conversationTranscript: loaded.transcript,
          ...(hint === undefined ? {} : { hint }),
          workspaceLanguage: loaded.language,
        },
        schema: channelReviewOutputSchema,
      });
      if (output === null) {
        return null;
      }

      const statusText = optionalProse(output.statusText);

      if (statusText === undefined) {
        return null;
      }

      const lastSelfReport =
        output.lastSelfReport === undefined
          ? undefined
          : optionalProse(output.lastSelfReport);

      return {
        ...(lastSelfReport === undefined ? {} : { lastSelfReport }),
        statusText,
      };
    },
    composeFollowUpAnswer: async ({
      callSessionId,
      followUpQuestion,
      hint,
      speakerName,
      taskTitle,
      workspaceId,
    }): Promise<ComposedFollowUpAnswer | null> => {
      const loaded = await loadTranscriptAndLanguage({
        callSessionId,
        ...(speakerName === undefined ? {} : { speakerName }),
        workspaceId,
      });

      if (loaded === null) {
        return null;
      }

      const output = await generateJson({
        config: buildConfig({
          properties: {
            answer: stringProperty(
              'One to three written sentences recording the answer.'
            ),
          },
          required: ['answer'],
          systemInstruction: followUpAnswerInstruction(loaded.language),
        }),
        input: {
          conversationTranscript: loaded.transcript,
          followUpTask: { followUpQuestion, title: taskTitle },
          ...(hint === undefined ? {} : { hint }),
          workspaceLanguage: loaded.language,
        },
        schema: followUpAnswerOutputSchema,
      });
      const answer = output === null ? undefined : optionalProse(output.answer);

      return answer === undefined ? null : { answer };
    },
    composeFollowUpTask: async ({
      callSessionId,
      hint,
      speakerName,
      workspaceId,
    }): Promise<ComposedFollowUpTask | null> => {
      const loaded = await loadTranscriptAndLanguage({
        callSessionId,
        ...(speakerName === undefined ? {} : { speakerName }),
        workspaceId,
      });

      if (loaded === null) {
        return null;
      }

      const output = await generateJson({
        config: buildConfig({
          properties: {
            followUpQuestion: stringProperty(
              'The concrete question to ask the other person, one or two sentences.'
            ),
            title: stringProperty('Concise label of the follow-up.'),
          },
          required: ['followUpQuestion', 'title'],
          systemInstruction: followUpTaskInstruction(loaded.language),
        }),
        input: {
          conversationTranscript: loaded.transcript,
          hint,
          workspaceLanguage: loaded.language,
        },
        schema: followUpTaskOutputSchema,
      });
      if (output === null) {
        return null;
      }

      const followUpQuestion = optionalProse(output.followUpQuestion);
      const title = optionalProse(output.title);

      return followUpQuestion === undefined || title === undefined
        ? null
        : { followUpQuestion, title };
    },
    composeWorkTaskPatch: async ({
      callSessionId,
      changeSummary,
      hint,
      speakerName,
      taskTitle,
      titleHint,
      workspaceId,
    }): Promise<ComposedWorkTaskPatch | null> => {
      const loaded = await loadTranscriptAndLanguage({
        callSessionId,
        ...(speakerName === undefined ? {} : { speakerName }),
        workspaceId,
      });

      if (loaded === null) {
        return null;
      }

      const output = await generateJson({
        config: buildConfig({
          properties: {
            reason: stringProperty(
              'One sentence stating the reason the user gave; empty string when none was stated.'
            ),
            title: stringProperty(
              'New task title; empty string unless the input contains titleHint.'
            ),
          },
          required: ['reason', 'title'],
          systemInstruction: workTaskPatchInstruction(loaded.language),
        }),
        input: {
          changeSummary,
          conversationTranscript: loaded.transcript,
          ...(hint === undefined ? {} : { hint }),
          task: { title: taskTitle },
          ...(titleHint === undefined ? {} : { titleHint }),
          workspaceLanguage: loaded.language,
        },
        schema: workTaskPatchOutputSchema,
      });

      if (output === null) {
        return null;
      }

      const reason =
        output.reason === undefined ? undefined : optionalProse(output.reason);
      const title =
        output.title === undefined ? undefined : optionalProse(output.title);

      return {
        ...(reason === undefined ? {} : { reason }),
        ...(title === undefined ? {} : { title }),
      };
    },
    composeWorkTaskTitle: async ({
      callSessionId,
      hint,
      speakerName,
      workspaceId,
    }): Promise<ComposedWorkTaskTitle | null> => {
      const loaded = await loadTranscriptAndLanguage({
        callSessionId,
        ...(speakerName === undefined ? {} : { speakerName }),
        workspaceId,
      });

      if (loaded === null) {
        return null;
      }

      const output = await generateJson({
        config: buildConfig({
          properties: {
            title: stringProperty('Concise title of the work task.'),
          },
          required: ['title'],
          systemInstruction: workTaskTitleInstruction(loaded.language),
        }),
        input: {
          conversationTranscript: loaded.transcript,
          hint,
          workspaceLanguage: loaded.language,
        },
        schema: workTaskTitleOutputSchema,
      });
      const title = output === null ? undefined : optionalProse(output.title);

      return title === undefined ? null : { title };
    },
  };
};
