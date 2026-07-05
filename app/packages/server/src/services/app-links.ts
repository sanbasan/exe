const buildAppUrl = ({
  appUrl,
  path,
}: {
  readonly appUrl: string;
  readonly path: string;
}): string => new URL(path, appUrl).toString();

export const buildWorkspaceAppUrl = ({
  appUrl,
  workspaceId,
}: {
  readonly appUrl: string;
  readonly workspaceId: string;
}): string => buildAppUrl({ appUrl, path: `/workspaces/${workspaceId}` });

export const buildTaskAppUrl = ({
  appUrl,
  taskId,
  workspaceId,
}: {
  readonly appUrl: string;
  readonly taskId: string;
  readonly workspaceId: string;
}): string =>
  buildAppUrl({ appUrl, path: `/workspaces/${workspaceId}/tasks/${taskId}` });
