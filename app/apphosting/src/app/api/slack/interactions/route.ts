import { reportServerError } from '#app/server/error-reporting';
import {
  slackBlockActionPayloadSchema,
  slackInteractionPayloadSchema,
  slackViewSubmissionPayloadSchema,
} from '#app/server/slack-payloads';
import { readVerifiedSlackBody } from '#app/server/slack-signature';
import { createFirebaseServerComposition } from '@exe/server';
import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const modalOpeningButtonActionIds = new Set([
  'exe.edit_task',
  'exe.open_call_schedule_settings',
  'exe.open_channel_owner_editor',
  'exe.open_channel_watch_settings',
  'exe.open_gbrain_connect',
  'exe.open_manage_admins',
  'exe.open_settings',
  'exe.open_scheduled_call_run_reschedule',
]);
const modalOpeningOverflowActionPrefixes = ['channel_settings:', 'edit:'];

const runAfterAck = (task: () => Promise<void>): void => {
  after(async (): Promise<void> => {
    try {
      await task();
    } catch (error: unknown) {
      await reportServerError({
        context: { route: 'slack/interactions.after' },
        error,
      });
    }
  });
};

const parseInteractionPayload = (rawBody: string): unknown => {
  const params = new URLSearchParams(rawBody);
  const payload = params.get('payload');

  if (payload === null) {
    throw new Error('Slack interaction payload is required.');
  }

  return JSON.parse(payload);
};

const readPayload = async (
  request: NextRequest
): Promise<ReturnType<typeof slackInteractionPayloadSchema.parse>> => {
  const rawBody = await readVerifiedSlackBody(request);

  return slackInteractionPayloadSchema.parse(parseInteractionPayload(rawBody));
};

type SlackBlockAction = ReturnType<
  typeof slackBlockActionPayloadSchema.parse
>['actions'][number];

const isModalOpeningAction = (action: SlackBlockAction): boolean => {
  if (action.type === 'button') {
    return modalOpeningButtonActionIds.has(action.action_id);
  }

  return modalOpeningOverflowActionPrefixes.some((prefix) =>
    action.selected_option.value.startsWith(prefix)
  );
};

const handleBlockAction = async ({
  action,
  blockId,
  channelId,
  messageTs,
  slackTeamId,
  slackUserId,
  triggerId,
  viewHash,
  viewId,
}: {
  readonly action: SlackBlockAction;
  readonly blockId?: string;
  readonly channelId?: string;
  readonly messageTs?: string;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
  readonly viewHash?: string;
  readonly viewId?: string;
}): Promise<void> => {
  const selectedOptionValue =
    action.type === 'overflow' || action.type === 'static_select'
      ? action.selected_option.value
      : undefined;
  const value = action.type === 'button' ? action.value : undefined;

  await createFirebaseServerComposition().services.slack.handleBlockAction({
    actionId: action.action_id,
    ...(blockId === undefined ? {} : { blockId }),
    ...(channelId === undefined ? {} : { channelId }),
    ...(messageTs === undefined ? {} : { messageTs }),
    ...(selectedOptionValue === undefined ? {} : { selectedOptionValue }),
    slackTeamId,
    slackUserId,
    ...(triggerId === undefined ? {} : { triggerId }),
    ...(value === undefined ? {} : { value }),
    ...(viewHash === undefined ? {} : { viewHash }),
    ...(viewId === undefined ? {} : { viewId }),
  });
};

const reportImmediateInteractionError = (error: unknown): Promise<void> =>
  reportServerError({
    context: { route: 'slack/interactions.immediate' },
    error,
  });

const processBlockAction = async (
  payload: ReturnType<typeof slackBlockActionPayloadSchema.parse>
): Promise<void> => {
  const action = payload.actions.at(0);

  if (action === undefined) {
    return;
  }

  const task = (): Promise<void> =>
    handleBlockAction({
      action,
      ...(action.block_id === undefined ? {} : { blockId: action.block_id }),
      ...(payload.channel?.id === undefined
        ? {}
        : { channelId: payload.channel.id }),
      ...(payload.message?.ts === undefined
        ? {}
        : { messageTs: payload.message.ts }),
      slackTeamId: payload.team.id,
      slackUserId: payload.user.id,
      ...(payload.trigger_id === undefined
        ? {}
        : { triggerId: payload.trigger_id }),
      ...(payload.view?.hash === undefined
        ? {}
        : { viewHash: payload.view.hash }),
      ...(payload.view === undefined ? {} : { viewId: payload.view.id }),
    });

  if (payload.trigger_id !== undefined && isModalOpeningAction(action)) {
    await task().catch(reportImmediateInteractionError);
    return;
  }

  runAfterAck(task);
};

const processViewSubmission = (
  payload: ReturnType<typeof slackViewSubmissionPayloadSchema.parse>
): void => {
  runAfterAck(
    (): Promise<void> =>
      createFirebaseServerComposition().services.slack.handleViewSubmission({
        callbackId: payload.view.callback_id,
        ...(payload.view.private_metadata === undefined
          ? {}
          : { privateMetadata: payload.view.private_metadata }),
        slackTeamId: payload.team.id,
        slackUserId: payload.user.id,
        stateValues: payload.view.state.values,
      })
  );
};

const processPayload = async (
  payload: ReturnType<typeof slackInteractionPayloadSchema.parse>
): Promise<void> => {
  const blockActionPayload = slackBlockActionPayloadSchema.safeParse(payload);

  if (blockActionPayload.success) {
    await processBlockAction(blockActionPayload.data);
  }

  const viewSubmissionPayload =
    slackViewSubmissionPayloadSchema.safeParse(payload);

  if (viewSubmissionPayload.success) {
    processViewSubmission(viewSubmissionPayload.data);
  }
};

const okSlackAck = (): NextResponse => new NextResponse(null, { status: 200 });

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    await processPayload(await readPayload(request));

    return okSlackAck();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
};
