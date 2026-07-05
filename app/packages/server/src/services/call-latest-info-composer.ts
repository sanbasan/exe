import { notFoundError } from '#server/errors';
import type {
  CallEventRepository,
  ChannelRepository,
  WorkspaceRepository,
} from '#server/ports';
import { buildCallTranscript } from '#server/services/call-transcript';
import {
  parseLatestInfoOutput,
  type LatestInfoGenerateContent,
} from '#server/services/channel-latest-info-synthesizer';
import type { Language } from '@exe/domain';
import { Type, type GenerateContentConfig } from '@google/genai';

export interface CallLatestInfoComposer {
  readonly composeFromCallTranscript: (params: {
    readonly callSessionId: string;
    readonly channelId: string;
    readonly guidance?: string;
    readonly speakerName?: string;
    readonly workspaceId: string;
  }) => Promise<string | null>;
}

const buildSystemInstruction = (language: Language): string => {
  if (language === 'ja') {
    return [
      'あなたはSlackチャンネルの現在状況を短く統合する編集者です。',
      'workspace languageである日本語だけで書いてください。',
      '入力は、チャンネルの既存のlatest info（現在状況の要約）と、進行中の音声会話の文字起こしです。',
      '文字起こしの中からこのチャンネルに関する発言だけを取り出し、既存のlatest infoと統合して、現在の進捗とブロックを中心に1段落の自然文でまとめてください。矛盾する場合は新しい発言を優先し、まだ正しい既存の内容は引き継いでください。',
      '全体で2〜3文、150字以内に収めてください。細部を網羅せず、現在の状態を判断するのに必要な要点だけに絞ってください。',
      '見出し、箇条書き、ラベル分割、次回確認予定、タスク詳細の羅列、変更履歴としての表現は禁止です。',
      '会話の口語表現をそのまま写さず、書き言葉に整えてください。',
      '情報が薄い場合でもプレースホルダーは返さず、分かる範囲の現在状況だけを書いてください。',
      '出力は {"latestInfo":"..."} のJSONだけにしてください。',
    ].join('\n');
  }

  return [
    'You are an editor who synthesizes the current state of a Slack channel.',
    'Write only in the workspace language, English.',
    "The input is the channel's existing latest info (a standing summary of the current state) and the transcript of an ongoing voice conversation.",
    'Extract only what the conversation says about this channel, integrate it with the existing latest info, and write one natural paragraph focused on current progress and blockers. Prefer newer statements when they conflict, and carry forward the parts of the existing summary that still hold.',
    'Keep the whole paragraph to two or three sentences (about 60 words). Do not enumerate details; keep only the essentials needed to judge the current state.',
    'Do not use headings, bullet points, labeled sections, next-check timing, task-detail lists, or changelog wording.',
    'Rewrite spoken phrasing into clean written prose.',
    'When input is sparse, still write only the current state that can be inferred and never return a placeholder.',
    'Return only JSON in the shape {"latestInfo":"..."}.',
  ].join('\n');
};

// Thought tokens count toward maxOutputTokens: on thinking models a tight
// budget gets consumed entirely by thinking and the response has NO text
// (finishReason MAX_TOKENS), which surfaced as "could not be composed" on
// every real-length call. Disable thinking (these are simple rewrite tasks;
// latency matters mid-call) and keep the token ceiling far away. NOTE:
// thinkingBudget 0 is rejected by Gemini 2.5 Pro (minimum 128) — keep the
// composer models on flash-tier.
const buildResponseConfig = (language: Language): GenerateContentConfig => ({
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: {
      latestInfo: {
        description: 'One paragraph channel latest info.',
        type: Type.STRING,
      },
    },
    required: ['latestInfo'],
    type: Type.OBJECT,
  },
  systemInstruction: buildSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const buildPrompt = ({
  channelName,
  existingLatestInfo,
  guidance,
  language,
  transcript,
}: {
  readonly channelName: string;
  readonly existingLatestInfo: string | null;
  readonly guidance?: string;
  readonly language: Language;
  readonly transcript: string;
}): string =>
  JSON.stringify(
    {
      channel: {
        existingLatestInfo,
        name: channelName,
      },
      conversationTranscript: transcript,
      ...(guidance === undefined ? {} : { guidance }),
      workspaceLanguage: language,
    },
    null,
    2
  );

export const createCallLatestInfoComposer = ({
  callEventRepository,
  channelRepository,
  generate,
  model,
  workspaceRepository,
}: {
  readonly callEventRepository: CallEventRepository;
  readonly channelRepository: ChannelRepository;
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
  readonly workspaceRepository: WorkspaceRepository;
}): CallLatestInfoComposer => ({
  composeFromCallTranscript: async ({
    callSessionId,
    channelId,
    guidance,
    speakerName,
    workspaceId,
  }): Promise<string | null> => {
    const [channel, workspace, events] = await Promise.all([
      channelRepository.getById({ channelId, workspaceId }),
      workspaceRepository.getById({ workspaceId }),
      callEventRepository.listByCallSessionId({ callSessionId, workspaceId }),
    ]);

    if (channel === null) {
      throw notFoundError(`Channel ${channelId} was not found.`);
    }

    if (workspace === null) {
      throw notFoundError(`Workspace ${workspaceId} was not found.`);
    }

    const transcript = buildCallTranscript({
      events,
      ...(speakerName === undefined ? {} : { speakerName }),
    });

    if (transcript.length === 0) {
      return null;
    }

    const response = await generate({
      config: buildResponseConfig(workspace.language),
      contents: [
        {
          parts: [
            {
              text: buildPrompt({
                channelName: channel.name,
                existingLatestInfo: channel.latestInfo ?? null,
                ...(guidance === undefined ? {} : { guidance }),
                language: workspace.language,
                transcript,
              }),
            },
          ],
          role: 'user',
        },
      ],
      model,
    });

    return parseLatestInfoOutput(response);
  },
});
