import type { LatestInfoGenerateContent } from '#server/services/channel-latest-info-synthesizer';
import type { Language, WorkTask } from '@exe/domain';
import { Type, type GenerateContentConfig } from '@google/genai';
import { z } from 'zod';

// Composes the handover document ("引き継ぎ書") written when a task moves to a
// new assignee through an AI-initiated reassignment. Sources: the call
// transcript where the handoff was agreed (the previous assignee is on that
// call, so their answers land here), the task itself, GBrain findings about
// the task, and any previous version of the note (so open questions get
// resolved over successive calls instead of resetting).

export interface HandoffComposer {
  readonly composeHandoffNote: (params: {
    readonly fromDisplayNames: readonly string[];
    readonly gbrainFindings: readonly string[];
    readonly language: Language;
    readonly previousNote?: string;
    readonly task: WorkTask;
    readonly toDisplayNames: readonly string[];
    readonly transcript: string;
  }) => Promise<string | null>;
}

const handoffResponseSchema = z
  .object({
    note: z.string().min(1),
  })
  .strip();

const buildSystemInstruction = (language: Language): string =>
  (language === 'ja'
    ? [
        'あなたはタスクの引き継ぎ書を書くアシスタントです。タスクが別の担当者に引き継がれます。',
        '通話の文字起こし(引き継ぎ元の担当者が参加)、タスク情報、ワークスペースの長期記憶(GBrain)の検索結果、既存の引き継ぎ書(あれば)から、新しい担当者がすぐ動ける引き継ぎ書を Markdown で書いてください。',
        '構成: ## 概要 / ## 現状 / ## 次の一歩 / ## 資料・場所 / ## 注意点 / ## 未解決の質問。',
        '「未解決の質問」には、引き継ぎに必要だがまだ分かっていないことを、元の担当者に聞く形で箇条書きにする。会話や既存の引き継ぎ書で既に答えが出た質問は本文に反映し、質問リストから消す。',
        '事実だけを書く。推測で埋めない。分からないことは未解決の質問へ。',
        '出力は {"note":"..."} の JSON のみ。',
      ]
    : [
        'You write task handover documents. A task is being handed to a new assignee.',
        'From the call transcript (the previous assignee was on the call), the task data, workspace long-term memory (GBrain) findings, and any previous handover note, write a Markdown handover doc the new assignee can act on immediately.',
        'Structure: ## Overview / ## Current state / ## Next step / ## Materials & locations / ## Gotchas / ## Open questions.',
        'Under "Open questions", list what is still unknown, phrased as questions for the previous assignee. Questions already answered in the conversation or previous note get folded into the body and removed from the list.',
        'Facts only; never fill gaps with guesses — unknowns go to Open questions.',
        'Return only JSON in the shape {"note":"..."}.',
      ]
  ).join('\n');

const buildConfig = (language: Language): GenerateContentConfig => ({
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
  responseSchema: {
    properties: {
      note: {
        description: 'The full handover document as Markdown.',
        type: Type.STRING,
      },
    },
    required: ['note'],
    type: Type.OBJECT,
  },
  systemInstruction: buildSystemInstruction(language),
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: 0 },
});

const parseNote = (text?: string): string | null => {
  if (text === undefined) {
    return null;
  }

  /* eslint-disable functional/no-try-statements -- JSON.parse has no non-throwing standard API. */
  try {
    const result = handoffResponseSchema.safeParse(JSON.parse(text));

    if (!result.success) {
      return null;
    }

    const note = result.data.note.trim();

    return note.length === 0 ? null : note;
  } catch (error: unknown) {
    void error;

    return null;
  }
  /* eslint-enable functional/no-try-statements */
};

export const createHandoffComposer = ({
  generate,
  model,
}: {
  readonly generate: LatestInfoGenerateContent;
  readonly model: string;
}): HandoffComposer => ({
  composeHandoffNote: async ({
    fromDisplayNames,
    gbrainFindings,
    language,
    previousNote,
    task,
    toDisplayNames,
    transcript,
  }): Promise<string | null> => {
    const input = {
      conversationTranscript: transcript,
      fromAssignees: fromDisplayNames,
      gbrainFindings,
      ...(previousNote === undefined
        ? {}
        : { previousHandoffNote: previousNote }),
      task: {
        ...(task.description === undefined
          ? {}
          : { description: task.description }),
        ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
        status: task.status,
        title: task.title,
      },
      toAssignees: toDisplayNames,
      workspaceLanguage: language,
    };
    const response = await generate({
      config: buildConfig(language),
      contents: [
        { parts: [{ text: JSON.stringify(input, null, 2) }], role: 'user' },
      ],
      model,
    });

    return parseNote(response.text);
  },
});
