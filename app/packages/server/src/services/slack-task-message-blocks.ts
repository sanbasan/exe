import type { SlackGateway, SlackUserInfo } from '#server/ports';
import type { Language, Task } from '@exe/domain';
import { buildTaskMessageBlocks } from '@exe/slack';
import type { KnownBlock } from '@slack/types';

const toTaskMessageUser = ({
  slackUserId,
  user,
}: {
  readonly slackUserId: string;
  readonly user?: SlackUserInfo;
}): {
  readonly displayName?: string;
  readonly realName?: string;
  readonly slackUserId: string;
} => ({
  ...(user?.displayName === undefined ? {} : { displayName: user.displayName }),
  ...(user?.realName === undefined ? {} : { realName: user.realName }),
  slackUserId,
});

const lookupSlackUserInfo = async ({
  botToken,
  slackGateway,
  slackUserId,
}: {
  readonly botToken: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserId: string;
}): Promise<SlackUserInfo | undefined> => {
  const lookup = await slackGateway.getUserInfo({ botToken, slackUserId });

  return lookup.status === 'ok' ? lookup.user : undefined;
};

const lookupTaskMessageUsers = ({
  botToken,
  slackGateway,
  slackUserIds,
}: {
  readonly botToken: string;
  readonly slackGateway: SlackGateway;
  readonly slackUserIds: readonly string[];
}): Promise<
  readonly {
    readonly displayName?: string;
    readonly realName?: string;
    readonly slackUserId: string;
  }[]
> => {
  const uniqueSlackUserIds = [...new Set(slackUserIds)];
  return Promise.all(
    uniqueSlackUserIds.map(async (slackUserId) => {
      const user = await lookupSlackUserInfo({
        botToken,
        slackGateway,
        slackUserId,
      });

      return toTaskMessageUser({
        slackUserId,
        ...(user === undefined ? {} : { user }),
      });
    })
  );
};

export const buildSlackTaskMessageBlocks = async ({
  botToken,
  language,
  previousDueAt,
  slackGateway,
  task,
  timezone,
}: {
  readonly botToken: string;
  readonly language: Language;
  readonly previousDueAt?: string;
  readonly slackGateway: SlackGateway;
  readonly task: Task;
  readonly timezone: string;
}): Promise<readonly KnownBlock[]> => {
  const [assignees, requesters] = await Promise.all([
    lookupTaskMessageUsers({
      botToken,
      slackGateway,
      slackUserIds: task.assigneeSlackUserIds,
    }),
    lookupTaskMessageUsers({
      botToken,
      slackGateway,
      slackUserIds: task.requesterSlackUserIds,
    }),
  ]);

  return buildTaskMessageBlocks({
    assignees,
    language,
    ...(previousDueAt === undefined ? {} : { previousDueAt }),
    requesters,
    task,
    timezone,
  });
};
