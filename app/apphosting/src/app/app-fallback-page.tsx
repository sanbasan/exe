import { getAppFallbackCopy, resolveAcceptLanguage } from '#app/app/content';
import { PageFrame } from '#app/app/page-frame';
import { publicPageConfig } from '#app/server/public-config';
import { headers } from 'next/headers';
import type { JSX } from 'react';

export const AppFallbackPage = async (): Promise<JSX.Element> => {
  const requestHeaders = await headers();
  const language = resolveAcceptLanguage(requestHeaders.get('accept-language'));

  return (
    <PageFrame
      actionHref={publicPageConfig.appStoreUrl ?? '/'}
      copy={getAppFallbackCopy(language)}
    />
  );
};
