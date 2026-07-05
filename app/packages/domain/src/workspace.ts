import {
  dateTimeSchema,
  languageSchema,
  slackTeamIdSchema,
  slackUserIdSchema,
  workspaceIdSchema,
} from './common';
import { z } from 'zod';

export const workspaceAdminSchema = z
  .object({
    emails: z.array(z.email()),
    slackUserIds: z.array(slackUserIdSchema),
  })
  .strict();

export const workspaceSchema = z
  .object({
    admin: workspaceAdminSchema.default({ emails: [], slackUserIds: [] }),
    botTokenExpiresAt: dateTimeSchema.optional(),
    botUserId: slackUserIdSchema,
    channelOwnerEditors: workspaceAdminSchema.default({
      emails: [],
      slackUserIds: [],
    }),
    createdAt: dateTimeSchema,
    encryptedBotRefreshToken: z.string().min(1).optional(),
    encryptedBotToken: z.string().min(1),
    id: workspaceIdSchema,
    language: languageSchema,
    name: z.string().min(1),
    slackTeamId: slackTeamIdSchema,
    timezone: z.string().min(1),
    updatedAt: dateTimeSchema,
  })
  .strict();

export const workspaceSummarySchema = z
  .object({
    admin: workspaceAdminSchema,
    botUserId: slackUserIdSchema,
    canManageWorkspaceSettings: z.boolean(),
    channelOwnerEditors: workspaceAdminSchema,
    hasAdmins: z.boolean(),
    id: workspaceIdSchema,
    language: languageSchema,
    name: z.string().min(1),
    slackTeamId: slackTeamIdSchema,
    timezone: z.string().min(1),
  })
  .strict();

export type Workspace = z.infer<typeof workspaceSchema>;

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const getWorkspaceAdminSlackUserIds = (
  workspace: Workspace
): readonly string[] => [...new Set(workspace.admin.slackUserIds)];

export const getWorkspaceChannelOwnerEditorSlackUserIds = (
  workspace: Workspace
): readonly string[] => [
  ...new Set(workspace.channelOwnerEditors.slackUserIds),
];

export const hasWorkspaceAdmins = (workspace: Workspace): boolean =>
  workspace.admin.emails.length > 0;

export const canManageWorkspaceSettings = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean =>
  getWorkspaceAdminSlackUserIds(workspace).some(
    (adminSlackUserId) => adminSlackUserId === slackUserId
  );

export const isWorkspaceChannelOwnerEditor = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): boolean =>
  getWorkspaceChannelOwnerEditorSlackUserIds(workspace).some(
    (editorSlackUserId) => editorSlackUserId === slackUserId
  );

export const toWorkspaceSummary = ({
  slackUserId,
  workspace,
}: {
  readonly slackUserId: string;
  readonly workspace: Workspace;
}): WorkspaceSummary =>
  workspaceSummarySchema.parse({
    admin: workspace.admin,
    botUserId: workspace.botUserId,
    canManageWorkspaceSettings: canManageWorkspaceSettings({
      slackUserId,
      workspace,
    }),
    channelOwnerEditors: workspace.channelOwnerEditors,
    hasAdmins: hasWorkspaceAdmins(workspace),
    id: workspace.id,
    language: workspace.language,
    name: workspace.name,
    slackTeamId: workspace.slackTeamId,
    timezone: workspace.timezone,
  });
