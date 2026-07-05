import { type Language } from '@exe/domain';
import { dispatcher } from '@exe/slack';

const PRODUCT_NAME = 'exe';

export interface FallbackPageCopy {
  readonly actionLabel: string;
  readonly body: string;
  readonly eyebrow: string;
  readonly secondary: string;
  readonly title: string;
}

export type OAuthCompleteStatus = 'error' | 'ok';

export const resolveAcceptLanguage = (
  acceptLanguage: string | null
): Language => {
  if (acceptLanguage?.toLowerCase().includes('ja') === true) {
    return 'ja';
  }

  return 'en';
};

export const getAppFallbackCopy = dispatcher<Language, FallbackPageCopy>({
  en: {
    actionLabel: 'Get the app',
    body: `Install ${PRODUCT_NAME} to open this workspace link and start a task review call from your iPhone.`,
    eyebrow: PRODUCT_NAME,
    secondary: `Slack remains the source of task context. ${PRODUCT_NAME} handles calls and follow-ups from the iOS app.`,
    title: 'Continue in the iOS app',
  },
  ja: {
    actionLabel: 'アプリを入手',
    body: `${PRODUCT_NAME} をインストールすると、このワークスペースのリンクを iPhone で開いてタスク確認会を開始できます。`,
    eyebrow: PRODUCT_NAME,
    secondary:
      'タスクの文脈は Slack に残し、通話と確認依頼の操作は iOS アプリから行います。',
    title: 'iOS アプリで続ける',
  },
});

export const resolveOAuthCompleteStatus = (
  status: string | null
): OAuthCompleteStatus => (status === 'error' ? 'error' : 'ok');

export const getOAuthCompleteCopy = (
  status: OAuthCompleteStatus
): FallbackPageCopy => {
  if (status === 'error') {
    return {
      actionLabel: 'Try installing again',
      body: 'We could not finish connecting Slack. Please start the installation again.',
      eyebrow: 'Slack connection failed',
      secondary:
        'If this keeps happening, contact support with the workspace where you tried to install the app.',
      title: 'Slack was not connected',
    };
  }

  return {
    actionLabel: `Open ${PRODUCT_NAME}`,
    body: `Slack is connected. Open ${PRODUCT_NAME} on iOS to choose a workspace and configure task review calls.`,
    eyebrow: 'Slack connected',
    secondary: 'You can close this page after opening the app.',
    title: `${PRODUCT_NAME} is ready`,
  };
};
