import { publicPageConfig } from '#app/server/public-config';

const UNIVERSAL_LINK_PATHS = ['/', '/workspaces/*'] as const;

const buildDetails = ({
  bundleIds,
  teamId,
}: {
  readonly bundleIds: readonly string[];
  readonly teamId?: string;
}): readonly {
  readonly appID: string;
  readonly paths: readonly string[];
}[] =>
  teamId === undefined
    ? []
    : bundleIds.map((bundleId) => ({
        appID: `${teamId}.${bundleId}`,
        paths: UNIVERSAL_LINK_PATHS,
      }));

export const dynamic = 'force-dynamic';

export const GET = (): Response =>
  Response.json(
    {
      applinks: {
        apps: [],
        details: buildDetails({
          bundleIds: publicPageConfig.iosBundleIds,
          ...(publicPageConfig.appleTeamId === undefined
            ? {}
            : { teamId: publicPageConfig.appleTeamId }),
        }),
      },
    },
    {
      headers: {
        'cache-control': 'public, max-age=3600',
      },
    }
  );
