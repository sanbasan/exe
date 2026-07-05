import type {
  Clock,
  GBrainAdminGateway,
  GBrainToken,
  SlackGateway,
  WorkspaceRepository,
} from '#server/ports';
import { withSlackBotToken } from './slack-bot-token';
import { canManageWorkspaceSettings, type Workspace } from '@exe/domain';
import {
  buildGbrainTokensModal,
  slackActionIds,
  type GbrainTokenRow,
} from '@exe/slack';

export interface SlackGbrainTokensDeps {
  readonly clock: Clock;
  readonly encryptionKey?: string;
  readonly gbrainAdminGateway: GBrainAdminGateway;
  readonly slackGateway: SlackGateway;
  readonly workspaceRepository: WorkspaceRepository;
}

const loadAdminWorkspace = async ({
  deps,
  slackTeamId,
  slackUserId,
}: {
  readonly deps: SlackGbrainTokensDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
}): Promise<Workspace | null> => {
  const workspace = await deps.workspaceRepository.getById({
    workspaceId: slackTeamId,
  });

  if (
    workspace === null ||
    !canManageWorkspaceSettings({ slackUserId, workspace })
  ) {
    return null;
  }

  return workspace;
};

const toTokenRows = (
  tokens: readonly GBrainToken[]
): readonly GbrainTokenRow[] =>
  tokens.map((token) => ({ createdAt: token.createdAt, name: token.name }));

// Token names double as the revoke key, so generate a per-user, collision-free
// name (`cc-<slackUserId>-<n>`) rather than prompting for free text — a Slack
// input block would force a submit button that can't render the minted token.
const nextTokenName = ({
  slackUserId,
  tokens,
}: {
  readonly slackUserId: string;
  readonly tokens: readonly GBrainToken[];
}): string => {
  const prefix = `cc-${slackUserId}-`;
  const used = new Set(
    tokens
      .map((token) => token.name)
      .filter((name) => name.startsWith(prefix))
      .map((name) => Number.parseInt(name.slice(prefix.length), 10))
      .filter((value) => Number.isInteger(value))
  );

  // Smallest positive integer not already in use — a gap must exist within the
  // first (size + 1) candidates.
  const index =
    Array.from({ length: used.size + 1 }, (_, offset) => offset + 1).find(
      (candidate) => !used.has(candidate)
    ) ?? used.size + 1;

  return `${prefix}${String(index)}`;
};

export const openSlackGbrainTokens = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  triggerId,
}: {
  readonly actionId: string;
  readonly deps: SlackGbrainTokensDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly triggerId?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.openGbrainConnect ||
    triggerId === undefined
  ) {
    return;
  }

  const workspace = await loadAdminWorkspace({
    deps,
    slackTeamId,
    slackUserId,
  });

  if (workspace === null) {
    return;
  }

  const tokens = await deps.gbrainAdminGateway.listTokens({
    workspaceId: workspace.id,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.openView({
        botToken,
        triggerId,
        view: buildGbrainTokensModal({
          language: workspace.language,
          tokens: toTokenRows(tokens),
        }),
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const createSlackGbrainToken = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  viewId,
}: {
  readonly actionId: string;
  readonly deps: SlackGbrainTokensDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly viewId?: string;
}): Promise<void> => {
  if (actionId !== slackActionIds.gbrainTokenCreate || viewId === undefined) {
    return;
  }

  const workspace = await loadAdminWorkspace({
    deps,
    slackTeamId,
    slackUserId,
  });

  if (workspace === null) {
    return;
  }

  const existing = await deps.gbrainAdminGateway.listTokens({
    workspaceId: workspace.id,
  });
  const connection = await deps.gbrainAdminGateway.mintToken({
    name: nextTokenName({ slackUserId, tokens: existing }),
    workspaceId: workspace.id,
  });
  const tokens = await deps.gbrainAdminGateway.listTokens({
    workspaceId: workspace.id,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.updateView({
        botToken,
        view: buildGbrainTokensModal({
          ...(connection === null
            ? { failed: true }
            : {
                connectScript: connection.connect,
                token: connection.token,
              }),
          language: workspace.language,
          tokens: toTokenRows(tokens),
        }),
        viewId,
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};

export const revokeSlackGbrainToken = async ({
  actionId,
  deps,
  slackTeamId,
  slackUserId,
  value,
  viewId,
}: {
  readonly actionId: string;
  readonly deps: SlackGbrainTokensDeps;
  readonly slackTeamId: string;
  readonly slackUserId: string;
  readonly value?: string;
  readonly viewId?: string;
}): Promise<void> => {
  if (
    actionId !== slackActionIds.gbrainTokenRevoke ||
    value === undefined ||
    viewId === undefined
  ) {
    return;
  }

  const workspace = await loadAdminWorkspace({
    deps,
    slackTeamId,
    slackUserId,
  });

  if (workspace === null) {
    return;
  }

  await deps.gbrainAdminGateway.revokeToken({
    name: value,
    workspaceId: workspace.id,
  });
  const tokens = await deps.gbrainAdminGateway.listTokens({
    workspaceId: workspace.id,
  });

  await withSlackBotToken({
    clock: deps.clock,
    ...(deps.encryptionKey === undefined
      ? {}
      : { encryptionKey: deps.encryptionKey }),
    run: ({ botToken }) =>
      deps.slackGateway.updateView({
        botToken,
        view: buildGbrainTokensModal({
          language: workspace.language,
          tokens: toTokenRows(tokens),
        }),
        viewId,
      }),
    slackGateway: deps.slackGateway,
    workspace,
    workspaceRepository: deps.workspaceRepository,
  });
};
