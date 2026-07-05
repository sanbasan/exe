import { notFoundError } from '#server/errors';
import type { CallEventRepository, WorkspaceRepository } from '#server/ports';
import { buildCallTranscript } from '#server/services/call-transcript';
import type { LatestInfoGenerateContent } from '#server/services/channel-latest-info-synthesizer';
import type { CallPurpose, Language } from '@exe/domain';
import { Type, type GenerateContentConfig } from '@google/genai';
import { z } from 'zod';

// One-sentence description of what a call was about, shown at the top of the
// post-call Slack DM (e.g. "pj-a、pj-b、pj-c の振り返りをした定例会"). Written
// from the transcript after the call ends; best-effort — callers treat null
// (and thrown errors) as "omit the line".

export interface CallOverviewComposer {
  readonly composeCallOverview: (params: {
    readonly callSessionId: string;
    readonly createdTaskTitles: readonly string[];
    readonly purpose: CallPurpose;
    readonly reviewedChannelNames: readonly string[];
    readonly updatedTaskTitles: readonly string[];
    readonly workspaceId: string;
  }) => Promise<string | null>;
}

const buildSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたは音声通話の文字起こしから、記録用の文章を書き起こすライターです。',
        'workspace languageである日本語だけで書いてください。',
        'この通話が何の会だったかが一目で分かる短い一文だけを書いてください。必ず50文字以内に収め、詳細の列挙や複数文は禁止です。',
        '例: 「pj-a、pj-b、pj-c の振り返りをした定例会」「pj-example のタスクの日程を変更した」のように、扱ったチャンネル名やタスクの内容を具体的に入れてください。',
        'callKind は通話の種類、reviewedChannels は通話中に振り返ったチャンネル、createdTasks / updatedTasks は通話中に作成・変更されたタスクです。会話の内容と合わせて使ってください。',
        '参加者名や日付は入れないでください。',
        '出力は {"overview":"..."} のJSONだけにしてください。',
      ]
    : [
        'You are a writer who turns a voice-call transcript into text for the record.',
        'Write only in the workspace language, English.',
        'Write one short sentence that states at a glance what this call was, e.g. "Recurring review covering pj-a, pj-b, and pj-c" or "Rescheduled a task in pj-example". Stay within 80 characters; never write multiple sentences or enumerate details.',
        'Name the channels and task work concretely. callKind is the kind of call, reviewedChannels are the channels reviewed during the call, and createdTasks / updatedTasks are the tasks created or changed during it; combine them with the conversation.',
        'Do not include participant names or dates.',
        'Return only JSON in the shape {"overview":"..."}.',
      ]
  ).join('\n');

const buildResponseConfig = (language: Language): GenerateContentConfig => ({
  // Thought tokens count toward maxOutputTokens; disable thinking so long
  // transcripts cannot exhaust the budget before any text is produced. See
  // call-latest-info-composer.ts for the incident details.
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: {
      overview: {
        description: 'One sentence stating what the call was about.',
        type: Type.STRING,
      },
    },
    required: ['overview'],
    type: Type.OBJECT,
  },
  systemInstruction: buildSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const getCallKindText = ({
  language,
  purpose,
}: {
  readonly language: Language;
  readonly purpose: CallPurpose;
}): string => {
  switch (purpose) {
    case 'follow_up_task':
      return language === 'ja'
        ? 'タスクのフォローアップ通話'
        : 'a follow-up call about a task';
    case 'manual_review':
      return language === 'ja'
        ? 'ユーザーが自分で開始した通話'
        : 'a call the user started themselves';
    case 'scheduled_review':
      return language === 'ja'
        ? 'スケジュール実行された定例のレビュー通話'
        : 'a scheduled recurring review call';
  }
};

const overviewResponseSchema = z
  .object({
    overview: z.string(),
  })
  .strict();

const normalize = (text: string): string => text.replace(/\s+/gu, ' ').trim();

const parseOverview = (text?: string): string | null => {
  if (text === undefined) {
    return null;
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    const result = overviewResponseSchema.safeParse(JSON.parse(text));

    if (!result.success) {
      return null;
    }

    const normalized = normalize(result.data.overview);

    return normalized.length === 0 ? null : normalized;
  } catch (error: unknown) {
    void error;

    return null;
  }
  /* eslint-enable functional/no-try-statements */
};

export const createCallOverviewComposer = ({
  callEventRepository,
  generate,
  model,
  workspaceRepository,
}: {
  readonly callEventRepository: Pick<
    CallEventRepository,
    'listByCallSessionId'
  >;
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
  readonly workspaceRepository: Pick<WorkspaceRepository, 'getById'>;
}): CallOverviewComposer => ({
  composeCallOverview: async ({
    callSessionId,
    createdTaskTitles,
    purpose,
    reviewedChannelNames,
    updatedTaskTitles,
    workspaceId,
  }): Promise<string | null> => {
    const [workspace, events] = await Promise.all([
      workspaceRepository.getById({ workspaceId }),
      callEventRepository.listByCallSessionId({ callSessionId, workspaceId }),
    ]);

    if (workspace === null) {
      throw notFoundError(`Workspace ${workspaceId} was not found.`);
    }

    const transcript = buildCallTranscript({ events });

    if (transcript.length === 0) {
      return null;
    }

    const input = {
      callKind: getCallKindText({ language: workspace.language, purpose }),
      conversationTranscript: transcript,
      ...(createdTaskTitles.length === 0
        ? {}
        : { createdTasks: createdTaskTitles }),
      ...(reviewedChannelNames.length === 0
        ? {}
        : { reviewedChannels: reviewedChannelNames }),
      ...(updatedTaskTitles.length === 0
        ? {}
        : { updatedTasks: updatedTaskTitles }),
      workspaceLanguage: workspace.language,
    };

    const response = await generate({
      config: buildResponseConfig(workspace.language),
      contents: [
        { parts: [{ text: JSON.stringify(input, null, 2) }], role: 'user' },
      ],
      model,
    });

    return parseOverview(response.text);
  },
});
