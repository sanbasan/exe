import { slackActionIds, slackViewIds } from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { KnownBlock, View } from '@slack/types';

export interface GbrainTokenRow {
  readonly createdAt: string;
  readonly name: string;
}

const getTitle = dispatcher<Language, string>({
  en: 'GBrain tokens',
  ja: 'GBrain 接続',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Close',
  ja: '閉じる',
});

const getIntroText = dispatcher<Language, string>({
  en: 'Issue and manage access tokens that let a coding agent (e.g. Claude Code) connect to this workspace’s GBrain over MCP.',
  ja: 'coding agent(Claude Code など)をこのワークスペースの GBrain に MCP 接続するためのトークンを発行・管理します。',
});

const getIssuedTokenLabel = dispatcher<Language, string>({
  en: 'Token issued (shown only this once):',
  ja: 'トークンを発行しました(この1回だけ表示):',
});

const getCreatedText = dispatcher<Language, string>({
  en: 'To connect, hand the following to your coding agent:',
  ja: '接続するには、以下を coding agent に渡してください:',
});

// The one-time reveal: a self-contained instruction (with the embedded token)
// that a local coding agent can act on directly, not just the bare command.
const buildAgentHandoff = dispatcher<
  Language,
  (connectScript: string) => string
>({
  en: (connectScript: string): string =>
    [
      'Connect to this workspace’s GBrain (our shared team memory) over MCP. Run:',
      connectScript,
      'Once connected, you can search and read this workspace’s memory — meeting notes and decisions from past calls — through the gbrain MCP tools.',
    ].join('\n\n'),
  ja: (connectScript: string): string =>
    [
      'このワークスペースの GBrain(チームの共有メモリ)に MCP 接続してください。次を実行:',
      connectScript,
      '接続後は、過去の通話の議事録や決定事項など、このワークスペースの記憶を gbrain の MCP ツールで検索・参照できます。',
    ].join('\n\n'),
});

const getFailedText = dispatcher<Language, string>({
  en: ':warning: Failed to issue a token. Please try again.',
  ja: ':warning: トークンの発行に失敗しました。もう一度お試しください。',
});

const getTokensHeading = dispatcher<Language, string>({
  en: 'Issued tokens',
  ja: '発行済みトークン',
});

const getNoTokensText = dispatcher<Language, string>({
  en: 'No tokens issued yet.',
  ja: 'まだトークンはありません。',
});

const getCreateButtonText = dispatcher<Language, string>({
  en: ':heavy_plus_sign: Issue token',
  ja: ':heavy_plus_sign: 新規発行',
});

const getRevokeButtonText = dispatcher<Language, string>({
  en: 'Revoke',
  ja: '失効',
});

const getCancelText = dispatcher<Language, string>({
  en: 'Cancel',
  ja: 'キャンセル',
});

const getRevokeConfirmTitle = dispatcher<Language, string>({
  en: 'Revoke token',
  ja: 'トークンを失効',
});

const getRevokeConfirmText = dispatcher<Language, (name: string) => string>({
  en: (name: string): string =>
    `Revoke "${name}"? Any coding agent using it will lose access immediately.`,
  ja: (name: string): string =>
    `「${name}」を失効しますか？このトークンを使っている coding agent は直ちに接続できなくなります。`,
});

const revokeAccessory = (
  language: Language,
  name: string
): NonNullable<Extract<KnownBlock, { type: 'section' }>['accessory']> => ({
  action_id: slackActionIds.gbrainTokenRevoke,
  confirm: {
    confirm: { text: getRevokeButtonText(language), type: 'plain_text' },
    deny: { text: getCancelText(language), type: 'plain_text' },
    style: 'danger',
    text: { text: getRevokeConfirmText(language)(name), type: 'plain_text' },
    title: { text: getRevokeConfirmTitle(language), type: 'plain_text' },
  },
  style: 'danger',
  text: { text: getRevokeButtonText(language), type: 'plain_text' },
  type: 'button',
  value: name,
});

const tokenBlock = (language: Language, token: GbrainTokenRow): KnownBlock => ({
  accessory: revokeAccessory(language, token.name),
  text: {
    text: `*${token.name}*  ·  ${token.createdAt.slice(0, 10)}`,
    type: 'mrkdwn',
  },
  type: 'section',
});

export const buildGbrainTokensModal = ({
  connectScript,
  failed,
  language,
  token,
  tokens,
}: {
  readonly connectScript?: string;
  readonly failed?: boolean;
  readonly language: Language;
  readonly token?: string;
  readonly tokens: readonly GbrainTokenRow[];
}): View => {
  const listBlocks: readonly KnownBlock[] =
    tokens.length === 0
      ? [
          {
            text: { text: getNoTokensText(language), type: 'mrkdwn' },
            type: 'section',
          },
        ]
      : tokens.map((token) => tokenBlock(language, token));

  return {
    blocks: [
      {
        text: { text: getIntroText(language), type: 'mrkdwn' },
        type: 'section',
      },
      ...(connectScript === undefined
        ? []
        : [
            {
              text: { text: getIssuedTokenLabel(language), type: 'mrkdwn' },
              type: 'section',
            } satisfies KnownBlock,
            ...(token === undefined
              ? []
              : [
                  {
                    text: { text: `\`\`\`\n${token}\n\`\`\``, type: 'mrkdwn' },
                    type: 'section',
                  } satisfies KnownBlock,
                ]),
            {
              text: { text: getCreatedText(language), type: 'mrkdwn' },
              type: 'section',
            } satisfies KnownBlock,
            {
              text: {
                text: `\`\`\`\n${buildAgentHandoff(language)(connectScript)}\n\`\`\``,
                type: 'mrkdwn',
              },
              type: 'section',
            } satisfies KnownBlock,
          ]),
      ...(failed === true
        ? [
            {
              text: { text: getFailedText(language), type: 'mrkdwn' },
              type: 'section',
            } satisfies KnownBlock,
          ]
        : []),
      { type: 'divider' },
      {
        text: {
          emoji: true,
          text: getTokensHeading(language),
          type: 'plain_text',
        },
        type: 'header',
      },
      ...listBlocks,
      { type: 'divider' },
      {
        elements: [
          {
            action_id: slackActionIds.gbrainTokenCreate,
            style: 'primary',
            text: {
              emoji: true,
              text: getCreateButtonText(language),
              type: 'plain_text',
            },
            type: 'button',
          },
        ],
        type: 'actions',
      },
    ],
    callback_id: slackViewIds.gbrainConnect,
    close: { text: getCloseText(language), type: 'plain_text' },
    title: { text: getTitle(language), type: 'plain_text' },
    type: 'modal',
  };
};
