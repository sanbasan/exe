import {
  getOAuthCompleteCopy,
  resolveOAuthCompleteStatus,
} from '#app/app/content';
import { PageFrame } from '#app/app/page-frame';
import { publicPageConfig } from '#app/server/public-config';
import type { JSX } from 'react';

const EXE_APP_LINK = 'exe://workspace-select';
const SLACK_INSTALL_PATH = '/api/slack/install';

interface SlackOAuthCompletePageProps {
  readonly searchParams?: Promise<{
    readonly status?: readonly string[] | string;
  }>;
}

const getStatusParam = (status?: readonly string[] | string): string | null => {
  if (typeof status === 'string') {
    return status;
  }

  return status?.at(0) ?? null;
};

const SlackOAuthCompletePage = async ({
  searchParams,
}: SlackOAuthCompletePageProps): Promise<JSX.Element> => {
  const params = await searchParams;
  const status = resolveOAuthCompleteStatus(getStatusParam(params?.status));

  return (
    <PageFrame
      actionHref={status === 'ok' ? EXE_APP_LINK : SLACK_INSTALL_PATH}
      copy={getOAuthCompleteCopy(status)}
      {...(status === 'ok' && publicPageConfig.appStoreUrl !== undefined
        ? { fallbackHref: publicPageConfig.appStoreUrl }
        : {})}
    />
  );
};

export default SlackOAuthCompletePage;
