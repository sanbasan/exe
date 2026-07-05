import type {
  Clock,
  SlackFile,
  SlackGateway,
  SlackMessage,
} from '#server/ports';
import { extractMentionedSlackUserIds } from '#server/services/slack-task-utils';
import { formatCurrentDateTime, parseDueAt } from './date-time';
import { callGeminiTaskExtraction } from './gemini';
import { constructTaskExtractionPrompt } from './prompt';
import { workTaskSchema, type Workspace, type WorkTask } from '@exe/domain';

const THREAD_FETCH_LIMIT = 100;

interface TaskExtractionMember {
  readonly displayName?: string;
  readonly realName?: string;
  readonly slackUserId: string;
}

export const getMessagesForTaskCreation = async ({
  botToken,
  channelId,
  files,
  messageTs,
  slackGateway,
  slackUserId,
  text,
  threadTs,
}: {
  readonly botToken: string;
  readonly channelId: string;
  readonly files?: readonly SlackFile[];
  readonly messageTs: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly text: string;
  readonly threadTs?: string;
}): Promise<readonly SlackMessage[]> => {
  if (threadTs === undefined) {
    return [
      {
        ...(files === undefined ? {} : { files }),
        text,
        ts: messageTs,
        user: slackUserId,
      },
    ];
  }

  const messages = await slackGateway.getReplies({
    botToken,
    channelId,
    inclusive: true,
    latest: messageTs,
    limit: THREAD_FETCH_LIMIT,
    threadTs,
  });

  return [...messages].reverse();
};

const getSenderMember = async ({
  botToken,
  slackGateway,
  slackUserId,
}: {
  readonly botToken: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
}): Promise<readonly TaskExtractionMember[]> => {
  const lookup = await slackGateway.getUserInfo({ botToken, slackUserId });

  return lookup.status === 'ok'
    ? [
        {
          ...(lookup.user.displayName === undefined
            ? {}
            : { displayName: lookup.user.displayName }),
          ...(lookup.user.realName === undefined
            ? {}
            : { realName: lookup.user.realName }),
          slackUserId: lookup.user.slackUserId,
        },
      ]
    : [];
};

const getExplicitAssigneeSlackUserIds = ({
  botUserId,
  slackUserId,
  text,
}: {
  readonly botUserId: string;
  readonly slackUserId: string;
  readonly text: string;
}): readonly string[] => [
  ...new Set(
    extractMentionedSlackUserIds(text).filter(
      (candidate) => candidate !== botUserId && candidate !== slackUserId
    )
  ),
];

export const buildSlackTaskFromMessages = async ({
  botToken,
  channelId,
  clock,
  files,
  messageTs,
  slackGateway,
  slackUserId,
  taskId,
  text,
  threadTs,
  workspace,
}: {
  readonly botToken: string;
  readonly channelId: string;
  readonly clock: Clock;
  readonly files?: readonly SlackFile[];
  readonly messageTs: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
  readonly taskId: string;
  readonly text: string;
  readonly threadTs?: string;
  readonly workspace: Workspace;
}): Promise<WorkTask | null> => {
  const now = clock.now();
  const [members, messages] = await Promise.all([
    getSenderMember({ botToken, slackGateway, slackUserId }),
    getMessagesForTaskCreation({
      botToken,
      channelId,
      ...(files === undefined ? {} : { files }),
      messageTs,
      slackGateway,
      slackUserId,
      text,
      ...(threadTs === undefined ? {} : { threadTs }),
    }),
  ]);
  const prompt = constructTaskExtractionPrompt({
    currentDateTime: formatCurrentDateTime({
      now,
      timezone: workspace.timezone,
    }),
    language: workspace.language,
    members,
    messages,
    timezone: workspace.timezone,
  });
  const extractedInfo = await callGeminiTaskExtraction(prompt);

  if (extractedInfo === null) {
    return null;
  }

  const explicitAssignees = getExplicitAssigneeSlackUserIds({
    botUserId: workspace.botUserId,
    slackUserId,
    text,
  });
  const geminiAssignee =
    extractedInfo.assigneeSlackUserId !== undefined &&
    extractedInfo.assigneeSlackUserId.length > 0 &&
    members.some(
      (member) => member.slackUserId === extractedInfo.assigneeSlackUserId
    )
      ? extractedInfo.assigneeSlackUserId
      : undefined;

  return workTaskSchema.parse({
    assigneeSlackUserIds:
      explicitAssignees.length > 0
        ? explicitAssignees
        : [geminiAssignee ?? slackUserId],
    channelId,
    createdAt: now,
    dueAt: parseDueAt({
      ...(extractedInfo.dueAt === undefined
        ? {}
        : { dueAt: extractedInfo.dueAt }),
      now,
      timezone: workspace.timezone,
    }),
    id: taskId,
    kind: 'work',
    messageTs,
    requesterSlackUserIds: [slackUserId],
    status: 'active',
    title: extractedInfo.title,
    updatedAt: now,
    workspaceId: workspace.id,
  });
};
