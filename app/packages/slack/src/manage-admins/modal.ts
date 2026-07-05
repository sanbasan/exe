import {
  slackActionIds,
  slackBlockIds,
  slackViewIds,
} from '#slack/contracts/ids';
import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';
import type { View } from '@slack/types';

const getTitle = dispatcher<Language, string>({
  en: 'Account management',
  ja: 'アカウント管理',
});

const getCloseText = dispatcher<Language, string>({
  en: 'Close',
  ja: '閉じる',
});

const getSaveText = dispatcher<Language, string>({
  en: 'Save',
  ja: '保存',
});

const getAdminLabel = dispatcher<Language, string>({
  en: 'Admins',
  ja: '管理者',
});

const getChannelOwnerEditorsLabel = dispatcher<Language, string>({
  en: 'Channel owner editors',
  ja: 'チャンネル担当者編集',
});

const getSelectUsersPlaceholder = dispatcher<Language, string>({
  en: 'Select users',
  ja: 'ユーザーを選択',
});

const getAdminContextText = dispatcher<Language, (name: string) => string>({
  en: (name) => `@${name} is an admin account`,
  ja: (name) => `@${name} は管理者アカウントです`,
});

export const buildManageAdminsModal = ({
  adminSlackUserIds,
  channelOwnerEditorSlackUserIds,
  currentUserDisplayName,
  currentUserSlackUserId,
  language,
}: {
  readonly adminSlackUserIds: readonly string[];
  readonly channelOwnerEditorSlackUserIds: readonly string[];
  readonly currentUserDisplayName: string;
  readonly currentUserSlackUserId: string;
  readonly language: Language;
}): View => {
  const adminInitialUsers = adminSlackUserIds.filter(
    (id) => id !== currentUserSlackUserId
  );
  const adminIds = new Set(adminSlackUserIds);
  const channelOwnerEditorInitialUsers = channelOwnerEditorSlackUserIds.filter(
    (id) => !adminIds.has(id)
  );

  return {
    blocks: [
      {
        elements: [
          {
            text: getAdminContextText(language)(currentUserDisplayName),
            type: 'mrkdwn',
          },
        ],
        type: 'context',
      },
      {
        block_id: slackBlockIds.manageAdminsUsers,
        element: {
          action_id: slackActionIds.manageAdminsUsers,
          ...(adminInitialUsers.length === 0
            ? {}
            : { initial_users: [...adminInitialUsers] }),
          placeholder: {
            text: getSelectUsersPlaceholder(language),
            type: 'plain_text',
          },
          type: 'multi_users_select',
        },
        label: {
          text: getAdminLabel(language),
          type: 'plain_text',
        },
        optional: true,
        type: 'input',
      },
      {
        block_id: slackBlockIds.manageAdminsChannelOwnerEditors,
        element: {
          action_id: slackActionIds.manageAdminsChannelOwnerEditors,
          ...(channelOwnerEditorInitialUsers.length === 0
            ? {}
            : { initial_users: [...channelOwnerEditorInitialUsers] }),
          placeholder: {
            text: getSelectUsersPlaceholder(language),
            type: 'plain_text',
          },
          type: 'multi_users_select',
        },
        label: {
          text: getChannelOwnerEditorsLabel(language),
          type: 'plain_text',
        },
        optional: true,
        type: 'input',
      },
    ],
    callback_id: slackViewIds.manageAdmins,
    close: {
      text: getCloseText(language),
      type: 'plain_text',
    },
    submit: {
      text: getSaveText(language),
      type: 'plain_text',
    },
    title: {
      text: getTitle(language),
      type: 'plain_text',
    },
    type: 'modal',
  };
};
