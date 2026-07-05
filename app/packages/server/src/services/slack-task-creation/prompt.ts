import type { SlackMessage } from '#server/ports';
import {
  formatMessageForTaskExtraction,
  type ConversationMember,
} from './format-message';
import type { Language } from '@exe/domain';

const constructInstructionBlock = (language: Language): string => {
  if (language === 'ja') {
    return `
Instruction:
以下の会話を分析し、タスク情報を抽出してください。
タスクが見つかる場合は、'extract_task_info' 関数を呼び出して抽出結果を返してください。
"title" は原則として自然な日本語で作成してください。
ただし固有名詞・技術識別子は原文を維持してください。
人名、組織名、製品名・サービス名、Slack ID、API/ライブラリ名、コード識別子、ファイルパス、英字略語は翻訳しないでください。
会話の一部が英語でも、タイトル全体が不自然にならない限り日本語タイトルを優先してください。
"レビューしました"、"修正しました"、"Revisions made, please review" のような状態報告や作業完了文をそのままタイトルにしないでください。
タイトルは依頼されている作業を動詞で表現してください（例: "確認する"、"修正する"、"共有する"）。
タイトルは20-40字程度を目安に、短く具体的にしてください。
"金曜までに" のような期限表現は "dueAt" に反映し、タイトルには含めないでください（例: "金曜までにレポートを提出する" → title: "レポートを提出する"）。
添付ファイル名が作業対象を特定する場合だけ、短くタイトルに含めてください。
"assigneeSlackUserId" は Available Users の ID から選んでください。担当者が明確でない場合はこの項目を省略してください。
"dueAt" は会話中に具体的な期限が明示されている場合のみ含めてください。期限がない場合は省略してください（システム側でデフォルトが適用されます）。
URL は [URL]、コードブロックは [CODE] にマスクされています。添付ファイルは件数とファイル名だけが Attachments として表示されます。URL、コード、添付本文をタイトルの主な根拠にしないでください。
明確なタスクがない場合は、会話内の暗黙的な依頼を探してください。
`;
  }

  return `
Instruction:
Analyze the following conversation and extract task details.
If a task is identified, call the 'extract_task_info' function with the extracted details.
Write "title" in natural English.
Keep proper nouns and technical identifiers in their original form.
Do not copy status reports or completion notes such as "reviewed", "fixed", or "Revisions made, please review" as the title.
Write the requested work as an action with a verb.
Keep the title short and specific, ideally around 20-40 characters where natural.
Deadline expressions such as "by Friday" belong in "dueAt"; never include them in the title (e.g., "submit the report by Friday" → title: "Submit the report").
Include an attachment filename in the title only when it identifies the work target, and keep it concise.
For "assigneeSlackUserId", select the appropriate ID from the Available Users list. If the assignee is not clearly specified in the conversation, omit this field entirely.
For "dueAt", only include this field if a specific deadline is explicitly mentioned in the conversation. If no deadline is mentioned, omit this field entirely - the system will apply default rules.
URLs are masked as [URL], code blocks are masked as [CODE], and attachments show only counts and filenames. Never use URLs, code, or attachment body content as the main basis for the title.
If no clear task is found, look for implied requests.
`;
};

export const constructTaskExtractionPrompt = ({
  currentDateTime,
  language,
  members,
  messages,
  timezone,
}: {
  readonly currentDateTime: string;
  readonly language: Language;
  readonly members: readonly ConversationMember[];
  readonly messages: readonly SlackMessage[];
  readonly timezone: string;
}): string => {
  const formattedMessages = messages
    .map((message) =>
      formatMessageForTaskExtraction({ language, members, message, timezone })
    )
    .join('\n');
  const userList = members
    .map(
      (member) =>
        `- ${member.realName ?? member.displayName ?? 'Unknown'} (ID: ${member.slackUserId})`
    )
    .join('\n');

  return `
Context:
Current Date and Time in Workspace Timezone (${timezone}): ${currentDateTime}
Workspace Language Setting: ${language}

Available Users:
${userList}

${constructInstructionBlock(language)}

Conversation:
${formattedMessages}
`;
};
