/* eslint-disable max-lines -- Meeting composer keeps transcription and extraction prompts together as one contract. */
import type { LatestInfoGenerateContent } from '#server/services/channel-latest-info-synthesizer';
import type { Language, Task } from '@exe/domain';
import { isOpenTaskStatus, isWorkTask } from '@exe/domain';
import {
  FinishReason,
  Type,
  type Content,
  type GenerateContentConfig,
  type Part,
} from '@google/genai';
import { z } from 'zod';

// LLM steps of the recording pipeline: (1) audio → diarized plain-text
// transcript (continued across calls when MAX_TOKENS truncates it),
// (2) transcript → Circleback-style notes + auto title as small JSON,
// (3) transcript + workspace context → task operations (creates / updates /
// dependency edges) + channel pick.

export interface MeetingTranscription {
  readonly decisions: readonly string[];
  readonly keyPoints: readonly string[];
  readonly overview: string;
  readonly title: string;
  readonly transcript: string;
}

export interface MeetingMemberContext {
  readonly displayName: string;
  readonly slackUserId: string;
}

export interface MeetingChannelContext {
  readonly channelId: string;
  readonly name: string;
}

const notesResponseSchema = z
  .object({
    decisions: z.array(z.string()).default([]),
    keyPoints: z.array(z.string()).default([]),
    overview: z.string().default(''),
    title: z.string().min(1),
  })
  .strip();

const meetingCreateOperationSchema = z
  .object({
    assigneeSlackUserIds: z.array(z.string()).default([]),
    description: z.string().optional(),
    dueAt: z.string().optional(),
    ref: z.string().min(1),
    startAt: z.string().optional(),
    title: z.string().min(1),
  })
  .strip();

const meetingUpdateOperationSchema = z
  .object({
    assigneeSlackUserIds: z.array(z.string()).optional(),
    description: z.string().optional(),
    dueAt: z.string().optional(),
    startAt: z.string().optional(),
    status: z.enum(['active', 'blocked', 'cancelled', 'completed']).optional(),
    taskId: z.string().min(1),
    title: z.string().optional(),
  })
  .strip();

const meetingDependencyOperationSchema = z
  .object({
    // Existing task id or a `ref` from creates.
    blocked: z.string().min(1),
    blocker: z.string().min(1),
  })
  .strip();

const extractionResponseSchema = z
  .object({
    channelId: z.string().optional(),
    creates: z.array(meetingCreateOperationSchema).default([]),
    dependencies: z.array(meetingDependencyOperationSchema).default([]),
    updates: z.array(meetingUpdateOperationSchema).default([]),
  })
  .strip();

export type MeetingCreateOperation = z.infer<
  typeof meetingCreateOperationSchema
>;

export type MeetingUpdateOperation = z.infer<
  typeof meetingUpdateOperationSchema
>;

export type MeetingDependencyOperation = z.infer<
  typeof meetingDependencyOperationSchema
>;

export type MeetingExtraction = z.infer<typeof extractionResponseSchema>;

export interface MeetingComposer {
  readonly extractOperations: (params: {
    readonly channels: readonly MeetingChannelContext[];
    readonly fixedChannelId?: string;
    readonly language: Language;
    readonly members: readonly MeetingMemberContext[];
    readonly now: string;
    readonly participantSlackUserIds?: readonly string[];
    readonly recorderSlackUserId?: string;
    readonly tasks: readonly Task[];
    readonly timezone: string;
    readonly transcript: string;
  }) => Promise<MeetingExtraction>;
  readonly transcribeRecording: (params: {
    readonly audioBase64: string;
    readonly language: Language;
    readonly mimeType: string;
    readonly participants?: readonly MeetingMemberContext[];
  }) => Promise<MeetingTranscription>;
}

const buildTranscriptionSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたは会議録音の書記です。渡された音声を日本語で文字起こししてください。',
        '発話を漏らさず、話者を区別し、各行を「話者名: 発言」の形式にする(話者名が分からない場合は「Speaker 1」のような番号ラベル)。',
        '出力は文字起こし本文のみ。JSON・前置き・後書き・見出しは一切書かない。',
      ]
    : [
        'You are the scribe for a meeting recording. Transcribe the audio in English.',
        'Capture every utterance. Distinguish speakers, one line per utterance in the form "Speaker name: ..." (use numbered labels like "Speaker 1" when the name is unknown).',
        'Output the transcript text only. No JSON, no preamble, no closing remarks, no headings.',
      ]
  ).join('\n');

// gemini-2.5-flash hard-caps a single response at 65536 output tokens.
// The transcript is plain text on purpose: JSON mode escapes non-ASCII and a
// single giant string field breaks irrecoverably when MAX_TOKENS truncates
// it. Truncated transcripts are instead continued across calls (see
// runTranscription).
const maxResponseTokens = 65536;

const transcriptionConfig = (language: Language): GenerateContentConfig => ({
  // Thought tokens count toward maxOutputTokens; disable thinking so long
  // recordings cannot exhaust the budget before any text is produced.
  maxOutputTokens: maxResponseTokens,
  systemInstruction: buildTranscriptionSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const buildNotesSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたは会議の書記です。渡された会議の文字起こしから、次を日本語で作成してください。',
        'title: 会議の内容が一目で分かる短いタイトル(30文字以内、日付や「会議」の語は不要)。',
        'overview: 会議全体の要約(2〜3文)。',
        'keyPoints: 重要な論点・共有事項の箇条書き。',
        'decisions: 決定事項の箇条書き(決まったことだけ)。',
        '出力は指定の JSON のみ。',
      ]
    : [
        'You are the scribe for a meeting. From the transcript you are given, produce, in English:',
        'title: a short at-a-glance meeting title (max 60 chars, no dates, no the word "meeting").',
        'overview: a 2-3 sentence summary.',
        'keyPoints: bullet list of important points.',
        'decisions: bullet list of decisions actually made.',
        'Return only the specified JSON.',
      ]
  ).join('\n');

const notesConfig = (language: Language): GenerateContentConfig => ({
  maxOutputTokens: maxResponseTokens,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: {
      decisions: { items: { type: Type.STRING }, type: Type.ARRAY },
      keyPoints: { items: { type: Type.STRING }, type: Type.ARRAY },
      overview: { type: Type.STRING },
      title: { type: Type.STRING },
    },
    required: ['title'],
    type: Type.OBJECT,
  },
  systemInstruction: buildNotesSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const buildExtractionSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたは会議の文字起こしからタスク管理システムへの操作を抽出するアシスタントです。',
        '会議で合意された作業だけを抽出してください。推測で作らないこと。',
        'creates: 新しいタスク。ref はこの応答内で依存関係から参照するための一意な短い ID(例 "n1")。title は具体的な作業内容。description には、後でエージェントが「このタスクは他の人に振れるか・動かせるか」を判断するための背景(なぜこのタスクがあるか、誰でなければならない作業か、交渉余地)を書く。assigneeSlackUserIds は会話の内容から最も可能性が高い担当者を推測して入れる(「私がやる」と言った人、その領域を担当している人、話者=録音者 recorderSlackUserId など、手がかりを総動員する)。確信が持てなくても最有力の一人を入れてよい。社外・外部要因の作業(クライアント確認待ちなど)だけ assigneeSlackUserIds を空配列にする。',
        'updates: 既存タスク(existingTasks)への変更が話された場合のみ。taskId は existingTasks の id。',
        'participantSlackUserIds が与えられたら、それがこの会議の参加者(=話者)。担当者の推測ではまず参加者を候補にする。',
        '重要: 発言中のタスクの呼び方は、言い換え・省略・別言語(日⇔英)のことがある。「チップの通知」が existingTasks の "Check notifications" を指す、のように意味で対応付けて、必ず existingTasks の id を使うこと。対応する既存タスクがあるのに新規タスクを作ってはいけない。',
        'dependencies: 「X が終わらないと Y ができない」「X が Y をブロックしている」型の依存関係(blocker=X、blocked=Y)。blocker / blocked には existingTasks の id か creates の ref を入れる。',
        'あるタスクが「他の全部」「残り全て」をブロックしている・待たせていると言われたら、existingTasks の他の全 open タスクそれぞれに対して 1 本ずつ依存関係を列挙する(blocker=そのタスク、blocked=各タスク)。省略しない。',
        'channelId: fixedChannelId が null の場合のみ、会議内容に最も合う channels の channelId を選ぶ。',
        '日時は ISO 8601(タイムゾーン付き)で書く。today と timezone を基準に「来週金曜」等を解決する。',
        '出力は指定の JSON のみ。',
      ]
    : [
        'You extract task-management operations from a meeting transcript.',
        'Extract only work that was actually agreed in the meeting. Never invent.',
        'creates: new tasks. ref is a short unique id (e.g. "n1") used to reference the task from dependencies within this response. title is the concrete work. In description, write the context a future agent needs to judge whether the task can be reassigned or moved (why it exists, whether it is person-bound, negotiation room). For assigneeSlackUserIds, INFER the most likely owner from the conversation — who volunteered, whose area it is, the speaker being the recorder (recorderSlackUserId), any cue available — and pick the single best candidate even without certainty. Only clearly external work (waiting on a client, vendor, approval) gets an empty assigneeSlackUserIds array.',
        'updates: only when the conversation changed an existing task (existingTasks). taskId must be an existingTasks id.',
        'When participantSlackUserIds is given, those are the meeting participants (= the speakers). Prefer them as assignee candidates.',
        'IMPORTANT: speakers refer to tasks via paraphrases, abbreviations, or another language (ja⇔en) — e.g. 「チップの通知」 may mean the existingTasks entry "Check notifications". Match by meaning, always output the existingTasks id, and never create a new task when a matching existing one is there.',
        'dependencies: "Y cannot proceed until X is done" / "X is blocking Y" relations (blocker=X, blocked=Y). blocker / blocked take an existingTasks id or a creates ref.',
        'When a task is said to block "everything else" / "all the other tasks", enumerate one dependency edge per other open existingTasks entry (blocker=that task, blocked=each task). Do not abbreviate.',
        'channelId: only when fixedChannelId is null, pick the best-fitting channelId from channels.',
        'Write datetimes as ISO 8601 with timezone, resolving phrases like "next Friday" from today and timezone.',
        'Return only the specified JSON.',
      ]
  ).join('\n');

const extractionConfig = (language: Language): GenerateContentConfig => ({
  maxOutputTokens: maxResponseTokens,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: {
      channelId: { nullable: true, type: Type.STRING },
      creates: {
        items: {
          properties: {
            assigneeSlackUserIds: {
              items: { type: Type.STRING },
              type: Type.ARRAY,
            },
            description: { nullable: true, type: Type.STRING },
            dueAt: { nullable: true, type: Type.STRING },
            ref: { type: Type.STRING },
            startAt: { nullable: true, type: Type.STRING },
            title: { type: Type.STRING },
          },
          required: ['ref', 'title'],
          type: Type.OBJECT,
        },
        type: Type.ARRAY,
      },
      dependencies: {
        items: {
          properties: {
            blocked: { type: Type.STRING },
            blocker: { type: Type.STRING },
          },
          required: ['blocked', 'blocker'],
          type: Type.OBJECT,
        },
        type: Type.ARRAY,
      },
      updates: {
        items: {
          properties: {
            assigneeSlackUserIds: {
              items: { type: Type.STRING },
              nullable: true,
              type: Type.ARRAY,
            },
            description: { nullable: true, type: Type.STRING },
            dueAt: { nullable: true, type: Type.STRING },
            startAt: { nullable: true, type: Type.STRING },
            status: { nullable: true, type: Type.STRING },
            taskId: { type: Type.STRING },
            title: { nullable: true, type: Type.STRING },
          },
          required: ['taskId'],
          type: Type.OBJECT,
        },
        type: Type.ARRAY,
      },
    },
    required: ['creates', 'dependencies', 'updates'],
    type: Type.OBJECT,
  },
  systemInstruction: buildExtractionSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const stripNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, stripNulls(entry)])
    );
  }

  return value;
};

const parseJsonResponse = <Value>({
  schema,
  text,
}: {
  readonly schema: z.ZodType<Value>;
  readonly text?: string;
}): Value => {
  if (text === undefined) {
    throw new Error('Model returned no text.');
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    return schema.parse(stripNulls(JSON.parse(text)));
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse model response: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  /* eslint-enable functional/no-try-statements */
};

// 20 continuations × 65536 tokens ≈ 1.3M output tokens — effectively
// unbounded for any real meeting; the cap only stops a pathological loop.
const maxTranscriptionContinuations = 20;

const continuationPrompt = (language: Language): string =>
  language === 'ja'
    ? '文字起こしが途中で切れました。切れた箇所から正確に続きを再開してください。既に書いた行は繰り返さないこと。'
    : 'The transcript was cut off. Continue exactly from where it stopped. Do not repeat lines already written.';

const runTranscription = async ({
  accumulated,
  generate,
  language,
  model,
  requestParts,
  round,
}: {
  readonly accumulated: string;
  readonly generate: LatestInfoGenerateContent;
  readonly language: Language;
  readonly model: string;
  readonly requestParts: readonly Part[];
  readonly round: number;
}): Promise<string> => {
  const contents: Content[] =
    accumulated.length === 0
      ? [{ parts: [...requestParts], role: 'user' }]
      : [
          { parts: [...requestParts], role: 'user' },
          { parts: [{ text: accumulated }], role: 'model' },
          { parts: [{ text: continuationPrompt(language) }], role: 'user' },
        ];
  const response = await generate({
    config: transcriptionConfig(language),
    contents,
    model,
  });
  const text = response.text ?? '';
  const merged =
    accumulated.length === 0 || text.length === 0
      ? `${accumulated}${text}`
      : `${accumulated}\n${text}`;
  const truncated =
    response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS;

  // On repeated truncation past the cap, keep the partial transcript — a
  // partial transcript beats failing the whole meeting.
  return truncated && text.length > 0 && round < maxTranscriptionContinuations
    ? runTranscription({
        accumulated: merged,
        generate,
        language,
        model,
        requestParts,
        round: round + 1,
      })
    : merged;
};

export const createMeetingComposer = ({
  generate,
  model,
}: {
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
}): MeetingComposer => ({
  extractOperations: async ({
    channels,
    fixedChannelId,
    language,
    members,
    now,
    participantSlackUserIds,
    recorderSlackUserId,
    tasks,
    timezone,
    transcript,
  }): Promise<MeetingExtraction> => {
    const existingTasks = tasks
      .filter(isWorkTask)
      .filter((task) => isOpenTaskStatus(task.status))
      .map((task) => ({
        assigneeSlackUserIds: task.assigneeSlackUserIds,
        ...(task.description === undefined
          ? {}
          : { description: task.description }),
        dependsOnTaskIds: task.dependsOnTaskIds,
        ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
        id: task.id,
        status: task.status,
        title: task.title,
      }));
    const input = {
      channels,
      existingTasks,
      fixedChannelId: fixedChannelId ?? null,
      members,
      ...(participantSlackUserIds === undefined
        ? {}
        : { participantSlackUserIds }),
      ...(recorderSlackUserId === undefined ? {} : { recorderSlackUserId }),
      timezone,
      today: now,
      transcript,
    };
    const response = await generate({
      config: extractionConfig(language),
      contents: [
        { parts: [{ text: JSON.stringify(input, null, 2) }], role: 'user' },
      ],
      model,
    });

    return parseJsonResponse({
      schema: extractionResponseSchema,
      ...(response.text === undefined ? {} : { text: response.text }),
    });
  },
  transcribeRecording: async ({
    audioBase64,
    language,
    mimeType,
    participants,
  }): Promise<MeetingTranscription> => {
    const participantList = (participants ?? [])
      .map(
        (participant) =>
          `${participant.displayName} (${participant.slackUserId})`
      )
      .join(language === 'ja' ? '、' : ', ');
    const participantsNote =
      participantList.length === 0
        ? ''
        : language === 'ja'
          ? `\n参加者(この人たちが話しています、名前と Slack ID): ${participantList}。話者を特定できる場合は "Speaker 1" ではなく名前を話者ラベルに使ってください(ID は書かない)。`
          : `\nParticipants (these people are speaking; name and Slack ID): ${participantList}. Use their names as speaker labels instead of "Speaker 1" when identifiable (do not print the IDs).`;
    const requestParts: readonly Part[] = [
      { inlineData: { data: audioBase64, mimeType } },
      {
        text:
          (language === 'ja'
            ? 'この録音を文字起こししてください。'
            : 'Transcribe this recording.') + participantsNote,
      },
    ];
    const transcript = await runTranscription({
      accumulated: '',
      generate,
      language,
      model,
      requestParts,
      round: 0,
    });

    if (transcript.trim().length === 0) {
      throw new Error('Model returned no text.');
    }

    const notesResponse = await generate({
      config: notesConfig(language),
      contents: [{ parts: [{ text: transcript }], role: 'user' }],
      model,
    });
    const notes = parseJsonResponse({
      schema: notesResponseSchema,
      ...(notesResponse.text === undefined ? {} : { text: notesResponse.text }),
    });

    return { ...notes, transcript };
  },
});
