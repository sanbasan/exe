import {
  createFirebaseServerComposition,
  reportServerError,
} from '@exe/server';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const REGION = 'us-central1';
const TIME_ZONE = 'UTC';

const apnsAuthKey = defineSecret('APNS_AUTH_KEY');
const apnsKeyId = defineSecret('APNS_KEY_ID');
const apnsTeamId = defineSecret('APNS_TEAM_ID');
const encryptionKey = defineSecret('ENCRYPTION_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const liveKitApiKey = defineSecret('LIVEKIT_API_KEY');
const liveKitApiSecret = defineSecret('LIVEKIT_API_SECRET');
const slackClientId = defineSecret('SLACK_CLIENT_ID');
const slackClientSecret = defineSecret('SLACK_CLIENT_SECRET');
const gbrainRouterAdminToken = defineSecret('GBRAIN_ROUTER_ADMIN_TOKEN');

// 全スケジュール関数が createFirebaseServerComposition() で完全な composition を
// 作る。composition 生成に必須の GBRAIN_ROUTER_ADMIN_TOKEN に加え、Slack bot
// トークンの復号(ENCRYPTION_KEY)や Slack 送信はワークフロー横断で発生するため、
// これらは関数ごとに取りこぼさず全関数で共有する基底に集約する。
const compositionSecrets = [
  encryptionKey,
  gbrainRouterAdminToken,
  slackClientId,
  slackClientSecret,
];
const slackNotificationSecrets = compositionSecrets;
const finalizeEndedCallsSecrets = [...compositionSecrets, geminiApiKey];
const startCallSecrets = [
  ...compositionSecrets,
  apnsAuthKey,
  apnsKeyId,
  apnsTeamId,
  liveKitApiKey,
  liveKitApiSecret,
];

const getNow = (): string => new Date().toISOString();

const normalizeLogError = (
  error: unknown
): {
  readonly message: string;
  readonly stack?: string;
} => {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return { message: String(error) };
};

const runScheduledWorkflow = ({
  functionName,
  task,
}: {
  readonly functionName: string;
  readonly task: () => Promise<void>;
}): Promise<void> =>
  task().catch(async (error: unknown): Promise<never> => {
    logger.error('Scheduled workflow failed.', {
      error: normalizeLogError(error),
      functionName,
    });
    await reportServerError({
      context: { route: `functions/${functionName}` },
      error,
    });

    throw error;
  });

export const sendCallPrenotifications = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    secrets: slackNotificationSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'sendCallPrenotifications',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.sendCallPrenotifications({ at: getNow() });
      },
    });
  }
);

export const sendScheduledCallDueNotifications = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    secrets: slackNotificationSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'sendScheduledCallDueNotifications',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.sendScheduledCallDueNotifications({
          at: getNow(),
        });
      },
    });
  }
);

export const startScheduledCalls = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    secrets: startCallSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'startScheduledCalls',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.startScheduledCalls({ at: getNow() });
      },
    });
  }
);

// 朝の負荷チェック: ワークスペースの timezone(既定 Asia/Tokyo)で 8:00 に
// 過負荷の担当者へ自動架電し、エージェントがタスクの引き剥がしを相談する。
export const startOverloadCalls = onSchedule(
  {
    region: REGION,
    schedule: '0 8 * * *',
    secrets: startCallSecrets,
    timeZone: 'Asia/Tokyo',
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'startOverloadCalls',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.startOverloadCalls({ at: getNow() });
      },
    });
  }
);

export const finalizeEndedCalls = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    secrets: finalizeEndedCallsSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'finalizeEndedCalls',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.finalizeEndedCalls();
      },
    });
  }
);

export const notifyMissedCalls = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    secrets: slackNotificationSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'notifyMissedCalls',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.notifyMissedCalls();
      },
    });
  }
);

export const notifyOverdueTasks = onSchedule(
  {
    region: REGION,
    schedule: 'every 30 minutes',
    secrets: slackNotificationSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'notifyOverdueTasks',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.notifyOverdueTasks({ at: getNow() });
      },
    });
  }
);

export const sleepIdleLiveKitVm = onSchedule(
  {
    region: REGION,
    schedule: 'every 5 minutes',
    secrets: compositionSecrets,
    timeZone: TIME_ZONE,
  },
  async (): Promise<void> => {
    await runScheduledWorkflow({
      functionName: 'sleepIdleLiveKitVm',
      task: async (): Promise<void> => {
        const composition = createFirebaseServerComposition();

        await composition.workflows.sleepIdleLiveKitVm();
      },
    });
  }
);
