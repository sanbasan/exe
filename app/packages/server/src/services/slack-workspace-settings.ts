import type { Clock, SlackGateway, WorkspaceRepository } from '#server/ports';
import { publishSlackAppHome, type SlackAppHomeDeps } from './slack-app-home';
import { withSlackBotToken } from './slack-bot-token';
import {
  canManageWorkspaceSettings,
  workspaceSchema,
  type Workspace,
} from '@exe/domain';
import {
  buildWorkspaceSettingsModal,
  parseWorkspaceSettingsLanguage,
  parseWorkspaceSettingsTimezone,
  slackActionIds,
  slackViewIds,
} from '@exe/slack';

interface SlackWorkspaceSettingsDeps {
  readonly appHomeDeps: SlackAppHomeDeps;
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

const canManageWorkspace = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean => canManageWorkspaceSettings({ slackUserId, workspace });

export const openSlackWorkspaceSettings = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackWorkspaceSettingsDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.openSettings || triggerId === undefined) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null || !canManageWorkspace({ slackUserId, workspace })) {
    return;
  }

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildWorkspaceSettingsModal({
          language: workspace.language,
          timezone: workspace.timezone,
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const saveSlackWorkspaceSettings = async ({
  callbackId,
  deps,
  slackTeamId,
  slackUserId,
  stateValues,
}: {
  readonly callbackId: string;
  readonly deps: SlackWorkspaceSettingsDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly stateValues: unknown;
}): Promise<void> => {
  if (callbackId !== slackViewIds.workspaceSettings) {
    return;
  }

  const language = parseWorkspaceSettingsLanguage(stateValues);
  const timezone = parseWorkspaceSettingsTimezone(stateValues);

  if (language === null || timezone === null) {
    return;
  }

  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (workspace === null || !canManageWorkspace({ slackUserId, workspace })) {
    return;
  }

  await deps.workspaceRepository.upsert({
    workspace: workspaceSchema.parse({
      ...workspace,
      language,
      timezone,
      updatedAt: deps.clock.now(),
    }),
  });
  await publishSlackAppHome({
    deps: deps.appHomeDeps,
    slackTeamId,
    slackUserId,
  });
};
