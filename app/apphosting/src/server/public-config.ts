/* eslint-disable no-process-env -- App Hosting page config boundary. */

const normalizeOptionalConfigValue = ({
  value,
}: {
  readonly value?: string;
}): string | undefined =>
  value === undefined || value.length === 0 || value.startsWith('TODO_')
    ? undefined
    : value;

const iosBundleIdConfig =
  process.env['IOS_BUNDLE_ID'] ?? process.env['APNS_BUNDLE_ID'];
const appleTeamIdConfig =
  process.env['APPLE_TEAM_ID'] ?? process.env['APNS_TEAM_ID'];
const appUrlConfig =
  process.env['NEXT_PUBLIC_APP_URL'] ?? process.env['APP_URL'];

const configuredIosBundleId = normalizeOptionalConfigValue({
  ...(iosBundleIdConfig === undefined ? {} : { value: iosBundleIdConfig }),
});

export const publicPageConfig = {
  appleTeamId: normalizeOptionalConfigValue({
    ...(appleTeamIdConfig === undefined ? {} : { value: appleTeamIdConfig }),
  }),
  appStoreUrl: process.env['APP_STORE_URL'],
  appUrl: normalizeOptionalConfigValue({
    ...(appUrlConfig === undefined ? {} : { value: appUrlConfig }),
  }),
  iosBundleIds:
    configuredIosBundleId === undefined
      ? [
          process.env['IOS_PROD_BUNDLE_ID'] ?? 'com.example.exe',
          process.env['IOS_DEV_BUNDLE_ID'] ?? 'com.example.exe.dev',
        ]
      : [configuredIosBundleId],
} as const;
