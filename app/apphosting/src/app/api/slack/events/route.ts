import { reportServerError } from '#app/server/error-reporting';
import {
  slackAppHomeOpenedEventSchema,
  slackEventCallbackSchema,
  type SlackMemberJoinedChannelEvent,
  slackMemberJoinedChannelEventSchema,
  type SlackEventUser,
  slackTeamJoinEventSchema,
  slackUrlVerificationSchema,
  slackUserChangeEventSchema,
  type SlackUserMessageEvent,
  slackUserMessageEventSchema,
} from '#app/server/slack-payloads';
import { readVerifiedSlackBody } from '#app/server/slack-signature';
import { createFirebaseServerComposition } from '@exe/server';
import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type Composition = ReturnType<typeof createFirebaseServerComposition>;

const parseJson = (rawBody: string): unknown => JSON.parse(rawBody);

const runAfterAck = (task: () => Promise<void>): void => {
  after(async (): Promise<void> => {
    try {
      await task();
    } catch (error: unknown) {
      await reportServerError({
        context: { route: 'slack/events.after' },
        error,
      });
    }
  });
};

const dispatchMemberEvent = ({
  composition,
  slackTeamId,
  user,
}: {
  readonly composition: Composition;
  readonly slackTeamId: string;
  readonly user: SlackEventUser;
}): Promise<void> => {
  const email = user.profile?.email;

  return composition.services.slack.syncSlackMember({
    slackTeamId,
    slackUserId: user.id,
    ...(email === undefined ? {} : { email }),
    ...(user.deleted === undefined ? {} : { deleted: user.deleted }),
    ...(user.is_bot === undefined ? {} : { isBot: user.is_bot }),
  });
};

const dispatchUserMessage = ({
  composition,
  data,
  slackTeamId,
}: {
  readonly composition: Composition;
  readonly data: SlackUserMessageEvent;
  readonly slackTeamId: string;
}): Promise<void> =>
  composition.services.slack.handleUserMessage({
    ...(data.bot_id === undefined ? {} : { botId: data.bot_id }),
    channelId: data.channel,
    ...(data.channel_type === undefined
      ? {}
      : { channelType: data.channel_type }),
    ...(data.files === undefined ? {} : { files: data.files }),
    messageTs: data.ts,
    slackTeamId,
    slackUserId: data.user,
    ...(data.subtype === undefined ? {} : { subtype: data.subtype }),
    text: data.text,
    ...(data.thread_ts === undefined ? {} : { threadTs: data.thread_ts }),
    type: data.type,
  });

const dispatchMemberJoinedChannel = ({
  composition,
  data,
  slackTeamId,
}: {
  readonly composition: Composition;
  readonly data: SlackMemberJoinedChannelEvent;
  readonly slackTeamId: string;
}): Promise<void> =>
  composition.services.slack.handleMemberJoinedChannel({
    channelId: data.channel,
    ...(data.inviter === undefined ? {} : { inviterSlackUserId: data.inviter }),
    slackTeamId,
    slackUserId: data.user,
  });

const handleEventCallback = async (payload: unknown): Promise<void> => {
  const eventCallback = slackEventCallbackSchema.parse(payload);
  const { event, team_id: slackTeamId } = eventCallback;
  const appHomeEvent = slackAppHomeOpenedEventSchema.safeParse(event);
  const userMessageEvent = slackUserMessageEventSchema.safeParse(event);
  const memberJoinedChannelEvent =
    slackMemberJoinedChannelEventSchema.safeParse(event);
  const teamJoinEvent = slackTeamJoinEventSchema.safeParse(event);
  const userChangeEvent = slackUserChangeEventSchema.safeParse(event);
  const memberUser = teamJoinEvent.success
    ? teamJoinEvent.data.user
    : userChangeEvent.success
      ? userChangeEvent.data.user
      : undefined;

  if (
    !appHomeEvent.success &&
    !userMessageEvent.success &&
    !memberJoinedChannelEvent.success &&
    memberUser === undefined
  ) {
    return;
  }

  const composition = createFirebaseServerComposition();

  if (appHomeEvent.success) {
    await composition.services.slack.publishAppHome({
      slackTeamId,
      slackUserId: appHomeEvent.data.user,
    });
  }

  if (memberUser !== undefined) {
    await dispatchMemberEvent({ composition, slackTeamId, user: memberUser });
  }

  if (memberJoinedChannelEvent.success) {
    await dispatchMemberJoinedChannel({
      composition,
      data: memberJoinedChannelEvent.data,
      slackTeamId,
    });
  }

  if (userMessageEvent.success) {
    await dispatchUserMessage({
      composition,
      data: userMessageEvent.data,
      slackTeamId,
    });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const rawBody = await readVerifiedSlackBody(request);
    const payload = parseJson(rawBody);
    const urlVerification = slackUrlVerificationSchema.safeParse(payload);

    if (urlVerification.success) {
      return NextResponse.json({ challenge: urlVerification.data.challenge });
    }

    runAfterAck((): Promise<void> => handleEventCallback(payload));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        ok: false,
      },
      { status: 401 }
    );
  }
};
