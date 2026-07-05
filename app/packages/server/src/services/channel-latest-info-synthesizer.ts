import type {
  Channel,
  ChannelBlock,
  ChannelReviewState,
  Language,
  WorkTask,
} from '@exe/domain';
import {
  Type,
  type ContentListUnion,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';

export interface ChannelLatestInfoSynthesisInput {
  readonly activeBlocks: readonly ChannelBlock[];
  readonly channel: Pick<Channel, 'channelId' | 'latestInfo' | 'name'>;
  readonly completedWorkTasks: readonly WorkTask[];
  readonly endedAt: string;
  readonly language: Language;
  readonly lookbackStartedAt: string;
  readonly resolvedBlocks: readonly ChannelBlock[];
  readonly statusReports: readonly ChannelReviewState[];
}

export interface ChannelLatestInfoSynthesizer {
  readonly synthesize: (
    input: ChannelLatestInfoSynthesisInput
  ) => Promise<string | null>;
}

export type LatestInfoGenerateContentResponse = Pick<
  GenerateContentResponse,
  'candidates' | 'text'
>;

export type LatestInfoGenerateContent = (params: {
  readonly config?: GenerateContentConfig;
  readonly contents: ContentListUnion;
  readonly model: string;
}) => Promise<LatestInfoGenerateContentResponse>;

const latestInfoResponseSchema = z
  .object({
    latestInfo: z.string(),
  })
  .strict();

const placeholderLatestInfo = new Set([
  'n/a',
  'no change',
  'no changes',
  'none',
  'unchanged',
  'なし',
  '変更なし',
  '特になし',
  '変わりなし',
]);

export const normalizeLatestInfoText = (text: string): string =>
  text.replace(/\s+/gu, ' ').trim();

const isPlaceholderLatestInfo = (text: string): boolean =>
  placeholderLatestInfo.has(text.toLocaleLowerCase());

export const sanitizeLatestInfoText = (text: string): string | null => {
  const normalized = normalizeLatestInfoText(text);

  if (normalized.length === 0 || isPlaceholderLatestInfo(normalized)) {
    return null;
  }

  return normalized;
};

export const parseLatestInfoOutput = (
  response: LatestInfoGenerateContentResponse
): string | null => {
  if (response.text === undefined) {
    return null;
  }

  const sanitized = sanitizeLatestInfoText(response.text);

  if (sanitized === null) {
    return null;
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    const parsed: unknown = JSON.parse(sanitized);

    if (typeof parsed === 'string') {
      return sanitizeLatestInfoText(parsed);
    }

    const result = latestInfoResponseSchema.safeParse(parsed);

    return result.success
      ? sanitizeLatestInfoText(result.data.latestInfo)
      : null;
  } catch (error: unknown) {
    void error;

    // Text that starts like JSON but does not parse is a failed/truncated
    // structured response (e.g. cut off at the token limit) — treat it as a
    // compose failure instead of storing the raw JSON as latest info. Plain
    // prose from models that ignore the JSON instruction is kept as-is.
    return sanitized.startsWith('{') ? null : sanitized;
  }
  /* eslint-enable functional/no-try-statements */
};

export const buildChannelLatestInfoSystemInstruction = (
  language: Language
): string => {
  if (language === 'ja') {
    return [
      'あなたはSlackチャンネルの現在状況を短く統合する編集者です。',
      'workspace languageである日本語だけで書いてください。',
      '既存のlatest info、直近72時間の個人報告、ブロック、最近完了した作業を統合し、現在の進捗とブロックを中心に1段落の自然文でまとめてください。',
      '見出し、箇条書き、ラベル分割、次回確認予定、タスク詳細の羅列、変更履歴としての表現は禁止です。',
      '情報が薄い場合でもプレースホルダーは返さず、分かる範囲の現在状況だけを書いてください。',
      '出力は {"latestInfo":"..."} のJSONだけにしてください。',
    ].join('\n');
  }

  return [
    'You are an editor who synthesizes the current state of a Slack channel.',
    'Write only in the workspace language, English.',
    'Integrate the existing latest info, recent personal status reports from the last 72 hours, blocks, and recently completed work into one natural paragraph focused on current progress and blockers.',
    'Do not use headings, bullet points, labeled sections, next-check timing, task-detail lists, or changelog wording.',
    'When input is sparse, still write only the current state that can be inferred and never return a placeholder.',
    'Return only JSON in the shape {"latestInfo":"..."}.',
  ].join('\n');
};

export const constructChannelLatestInfoPrompt = (
  input: ChannelLatestInfoSynthesisInput
): string =>
  JSON.stringify(
    {
      activeBlocks: input.activeBlocks.map((block) => ({
        createdAt: block.createdAt,
        description: block.description,
        title: block.title,
      })),
      channel: {
        existingLatestInfo: input.channel.latestInfo ?? null,
        id: input.channel.channelId,
        name: input.channel.name,
      },
      completedWorkTasks: input.completedWorkTasks.map((task) => ({
        completedAt: task.completedAt,
        title: task.title,
      })),
      recentStatusReports: input.statusReports.map((state) => ({
        slackUserId: state.slackUserId,
        statusText: state.statusText,
        statusUpdatedAt: state.statusUpdatedAt,
      })),
      resolvedBlocks: input.resolvedBlocks.map((block) => ({
        description: block.description,
        resolvedAt: block.resolvedAt,
        title: block.title,
      })),
      synthesisWindow: {
        endedAt: input.endedAt,
        lookbackStartedAt: input.lookbackStartedAt,
      },
      workspaceLanguage: input.language,
    },
    null,
    2
  );

// Thought tokens count toward maxOutputTokens; without disabling thinking,
// long inputs exhaust the budget before any text is produced. See
// call-latest-info-composer.ts for the incident details.
const latestInfoResponseConfig = (
  language: Language
): GenerateContentConfig => ({
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
  systemInstruction: buildChannelLatestInfoSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

export const createChannelLatestInfoSynthesizer = ({
  generate,
  model,
}: {
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
}): ChannelLatestInfoSynthesizer => ({
  synthesize: async (
    input: ChannelLatestInfoSynthesisInput
  ): Promise<string | null> => {
    const response = await generate({
      config: latestInfoResponseConfig(input.language),
      contents: [
        {
          parts: [{ text: constructChannelLatestInfoPrompt(input) }],
          role: 'user',
        },
      ],
      model,
    });

    return parseLatestInfoOutput(response);
  },
});
