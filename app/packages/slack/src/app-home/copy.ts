import { dispatcher } from '#slack/utils/dispatcher';
import { type Language } from '@exe/domain';

export const getAdminHeading = dispatcher<Language, string>({
  en: ':wrench: Admin',
  ja: ':wrench: 管理者メニュー',
});

export const getBillingButtonText = dispatcher<Language, string>({
  en: ':credit_card: Billing',
  ja: ':credit_card: 請求',
});

export const getChannelBlocksHeading = dispatcher<Language, string>({
  en: 'Blocks',
  ja: 'ブロック',
});

export const getChannelLatestInfoHeading = dispatcher<Language, string>({
  en: 'Latest info',
  ja: '最新情報',
});

export const getChannelReviewStatusHeading = dispatcher<Language, string>({
  en: 'Individual status',
  ja: '個人別の状況',
});

export const getChannelReviewNextCheckLabel = dispatcher<Language, string>({
  en: 'Next check',
  ja: '次回確認',
});

export const getChangeShownChannelsButtonText = dispatcher<Language, string>({
  en: 'Channels to check',
  ja: '確認したいチャンネル',
});

export const getEditChannelButtonText = dispatcher<Language, string>({
  en: 'Edit',
  ja: '編集',
});

export const getEditChannelOwnersButtonText = dispatcher<Language, string>({
  en: 'Change channel owners',
  ja: 'チャンネル担当者を変更',
});

export const getEmptyStateText = dispatcher<Language, string>({
  en: ':white_check_mark: *No tasks*\n\nTo start managing tasks, please mention `@exe` in a channel.',
  ja: ':white_check_mark: *タスクはありません*\n\nタスク管理を始めるには、チャンネルで `@exe` にメンションしてください。',
});

export const getFollowUpHeading = dispatcher<Language, string>({
  en: 'Follow-up requests',
  ja: '確認依頼',
});

export const getGbrainConnectButtonText = dispatcher<Language, string>({
  en: ':brain: Connect GBrain',
  ja: ':brain: GBrain 接続',
});

export const getHomeChannelHeading = dispatcher<Language, string>({
  en: 'Channels',
  ja: 'チャンネル',
});

export const getManageAdminsButtonText = dispatcher<Language, string>({
  en: ':busts_in_silhouette: Manage Accounts',
  ja: ':busts_in_silhouette: アカウント管理',
});

export const getManageChannelOwnersButtonText = dispatcher<Language, string>({
  en: 'Manage channel owners',
  ja: 'チャンネル担当者を管理',
});

export const getMoreChannelsText = dispatcher<
  Language,
  (count: number) => string
>({
  en: (count: number): string =>
    `…and ${String(count)} more channels in the app.`,
  ja: (count: number): string =>
    `…ほか ${String(count)} チャンネルはアプリで確認できます。`,
});

export const getNextCallHeading = dispatcher<Language, string>({
  en: 'Review call',
  ja: '確認通話',
});

export const getNoChannelBlocksText = dispatcher<Language, string>({
  en: 'No active blocks.',
  ja: '未解決のブロックはありません。',
});

export const getNoChannelLatestInfoText = dispatcher<Language, string>({
  en: 'No latest info recorded yet.',
  ja: '最新情報はまだありません。',
});

export const getNoChannelTasksText = dispatcher<Language, string>({
  en: 'No tasks.',
  ja: 'タスクはありません。',
});

export const getNoFollowUpText = dispatcher<Language, string>({
  en: 'No open follow-up requests.',
  ja: '未完了の確認依頼はありません。',
});

export const getNoChannelText = dispatcher<Language, string>({
  en: 'No assigned channels.',
  ja: '担当チャンネルはありません。',
});

export const getNoChannelAssigneeText = dispatcher<Language, string>({
  en: 'No owner assigned',
  ja: '担当者なし',
});

export const getChannelAssigneeConfiguredText = dispatcher<Language, string>({
  en: 'Owner assigned',
  ja: '担当者設定済み',
});

export const getOpenChannelButtonText = dispatcher<Language, string>({
  en: 'Open in app',
  ja: 'アプリで開く',
});

export const getChannelHeading = dispatcher<Language, string>({
  en: 'Assigned channels',
  ja: '担当チャンネル',
});

export const getChannelsHeading = dispatcher<Language, string>({
  en: 'Channels',
  ja: 'チャンネル',
});

export const getSettingsButtonText = dispatcher<Language, string>({
  en: ':gear: General Settings',
  ja: ':gear: 一般設定',
});

export const getSettingsHeading = dispatcher<Language, string>({
  en: ':gear: Settings',
  ja: ':gear: 設定',
});

export const getTaskSectionHeading = dispatcher<
  'assigned' | 'requested',
  (language: Language) => string
>({
  assigned: dispatcher<Language, string>({
    en: 'Assigned tasks',
    ja: '担当タスク',
  }),
  requested: dispatcher<Language, string>({
    en: 'Requested tasks',
    ja: '依頼したタスク',
  }),
});
