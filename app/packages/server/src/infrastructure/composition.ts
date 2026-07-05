import {
  createServerComposition,
  type ServerCompositionDeps,
  type ServerComposition,
} from '#server/composition';
import { getRequiredConfigValue, serverConfig } from '#server/config';
import type {
  LiveKitGateway,
  LiveKitVmGateway,
  NotificationGateway,
} from '#server/ports';
import { createCallLatestInfoComposer } from '#server/services/call-latest-info-composer';
import { createCallOverviewComposer } from '#server/services/call-overview-composer';
import { createCallProseComposer } from '#server/services/call-prose-composer';
import { createChannelLatestInfoSynthesizer } from '#server/services/channel-latest-info-synthesizer';
import { systemClock } from './clock';
import {
  createGcpLiveKitVmGateway,
  createNoopLiveKitVmGateway,
} from './compute';
import { createSendGridEmailGateway } from './email';
import { getFirebaseApp } from './firebase/app';
import { createFirebaseAuthGateway } from './firebase/auth';
import { createFirestoreRepositories } from './firestore';
import { createGBrainAdminGateway } from './gbrain';
import { generateContent } from './gemini';
import { randomIdGenerator } from './id-generator';
import { createLiveKitGateway } from './livekit';
import { createNotificationGateway } from './notifications';
import { createSlackGateway } from './slack';
import { getFirestore } from 'firebase-admin/firestore';

const createAppReviewSignInDeps = (): Pick<
  ServerCompositionDeps,
  'appReviewSignIn'
> => {
  const { testAccountEmail, testSignInCode } = serverConfig.appReview;

  if (testAccountEmail === undefined || testSignInCode === undefined) {
    return {};
  }

  return {
    appReviewSignIn: {
      code: testSignInCode,
      email: testAccountEmail,
    },
  };
};

const createLiveKitVmGatewayFromConfig = (): LiveKitVmGateway => {
  const { instanceName, projectId, zone } = serverConfig.livekitVm;
  const wsUrl = serverConfig.livekit.wsUrl;

  if (
    instanceName === undefined ||
    projectId === undefined ||
    wsUrl === undefined
  ) {
    return createNoopLiveKitVmGateway();
  }

  return createGcpLiveKitVmGateway({
    instanceName,
    projectId,
    wsUrl,
    zone,
  });
};

const createLazyLiveKitGateway = ({
  vmGateway,
}: {
  readonly vmGateway: LiveKitVmGateway;
}): LiveKitGateway => {
  const createGateway = (): LiveKitGateway =>
    createLiveKitGateway({
      apiKey: getRequiredConfigValue({
        label: 'LIVEKIT_API_KEY',
        ...(serverConfig.livekit.apiKey === undefined
          ? {}
          : { value: serverConfig.livekit.apiKey }),
      }),
      apiSecret: getRequiredConfigValue({
        label: 'LIVEKIT_API_SECRET',
        ...(serverConfig.livekit.apiSecret === undefined
          ? {}
          : { value: serverConfig.livekit.apiSecret }),
      }),
      vmGateway,
      wsUrl: getRequiredConfigValue({
        label: 'LIVEKIT_WS_URL',
        ...(serverConfig.livekit.wsUrl === undefined
          ? {}
          : { value: serverConfig.livekit.wsUrl }),
      }),
    });
  const runWithGateway = <Value>(
    run: (gateway: LiveKitGateway) => Promise<Value>
  ): Promise<Value> => Promise.resolve().then(() => run(createGateway()));

  return {
    createParticipantToken: (params): Promise<string> =>
      runWithGateway((gateway) => gateway.createParticipantToken(params)),
    deleteRoom: (params): Promise<void> =>
      runWithGateway((gateway) => gateway.deleteRoom(params)),
    ensureAgentDispatched: (params): Promise<void> =>
      runWithGateway((gateway) => gateway.ensureAgentDispatched(params)),
    warmUpAgentWorker: (): Promise<void> =>
      Promise.resolve().then(() => vmGateway.ensureRunning()),
  };
};

export const createFirebaseServerComposition = (params?: {
  readonly notificationGateway?: NotificationGateway;
}): ServerComposition => {
  const app = getFirebaseApp();
  const firestore = getFirestore(app);
  const repositories = createFirestoreRepositories({ firestore });
  const liveKitVmGateway = createLiveKitVmGatewayFromConfig();
  const slackGateway = createSlackGateway({
    ...(serverConfig.slack.clientId === undefined
      ? {}
      : { clientId: serverConfig.slack.clientId }),
    ...(serverConfig.slack.clientSecret === undefined
      ? {}
      : { clientSecret: serverConfig.slack.clientSecret }),
  });
  const notificationGateway =
    params?.notificationGateway ??
    createNotificationGateway({
      apns: {
        bundleId: serverConfig.apns.bundleId,
        ...(serverConfig.apns.authKey === undefined
          ? {}
          : { authKey: serverConfig.apns.authKey }),
        ...(serverConfig.apns.keyId === undefined
          ? {}
          : { keyId: serverConfig.apns.keyId }),
        ...(serverConfig.apns.teamId === undefined
          ? {}
          : { teamId: serverConfig.apns.teamId }),
      },
      appUrl: getRequiredConfigValue({
        label: 'APP_URL',
        ...(serverConfig.app.publicUrl === undefined
          ? {}
          : { value: serverConfig.app.publicUrl }),
      }),
      clock: systemClock,
      ...(serverConfig.security.encryptionKey === undefined
        ? {}
        : { encryptionKey: serverConfig.security.encryptionKey }),
      slackGateway,
      workspaceRepository: repositories.workspaceRepository,
    });

  return createServerComposition({
    ...repositories,
    ...createAppReviewSignInDeps(),
    appUrl: getRequiredConfigValue({
      label: 'APP_URL',
      ...(serverConfig.app.publicUrl === undefined
        ? {}
        : { value: serverConfig.app.publicUrl }),
    }),
    authGateway: createFirebaseAuthGateway(),
    callLatestInfoComposer: createCallLatestInfoComposer({
      callEventRepository: repositories.callEventRepository,
      channelRepository: repositories.channelRepository,
      generate: generateContent,
      model: serverConfig.gemini.latestInfoModel,
      workspaceRepository: repositories.workspaceRepository,
    }),
    callOverviewComposer: createCallOverviewComposer({
      callEventRepository: repositories.callEventRepository,
      generate: generateContent,
      model: serverConfig.gemini.latestInfoModel,
      workspaceRepository: repositories.workspaceRepository,
    }),
    callProseComposer: createCallProseComposer({
      callEventRepository: repositories.callEventRepository,
      channelRepository: repositories.channelRepository,
      generate: generateContent,
      model: serverConfig.gemini.latestInfoModel,
      workspaceRepository: repositories.workspaceRepository,
    }),
    channelLatestInfoSynthesizer: createChannelLatestInfoSynthesizer({
      generate: generateContent,
      model: serverConfig.gemini.latestInfoModel,
    }),
    clock: systemClock,
    emailGateway: createSendGridEmailGateway({
      fromEmail: serverConfig.sendgrid.fromEmail,
      ...(serverConfig.sendgrid.apiKey === undefined
        ? {}
        : { apiKey: serverConfig.sendgrid.apiKey }),
    }),
    ...(serverConfig.security.encryptionKey === undefined
      ? {}
      : { encryptionKey: serverConfig.security.encryptionKey }),
    gbrainAdminGateway: createGBrainAdminGateway({
      adminToken: getRequiredConfigValue({
        label: 'GBRAIN_ROUTER_ADMIN_TOKEN',
        ...(serverConfig.gbrain.adminToken === undefined
          ? {}
          : { value: serverConfig.gbrain.adminToken }),
      }),
      baseUrl: getRequiredConfigValue({
        label: 'GBRAIN_BASE_URL',
        ...(serverConfig.gbrain.baseUrl === undefined
          ? {}
          : { value: serverConfig.gbrain.baseUrl }),
      }),
    }),
    idGenerator: randomIdGenerator,
    liveKitAgentName: serverConfig.livekit.agentName,
    liveKitGateway: createLazyLiveKitGateway({
      vmGateway: liveKitVmGateway,
    }),
    liveKitRoomNamePrefix: serverConfig.livekit.roomNamePrefix,
    liveKitVmAutoStopEnabled: serverConfig.livekitVm.autoStopEnabled,
    liveKitVmGateway,
    liveKitVmIdleGraceMinutes: serverConfig.livekitVm.idleGraceMinutes,
    notificationGateway,
    slackGateway,
  });
};
