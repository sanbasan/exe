import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';

const isUnknownRecord = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const getRecordValue = ({
  key,
  value,
}: {
  readonly key: string;
  readonly value: unknown;
}): unknown => (isUnknownRecord(value) ? Reflect.get(value, key) : undefined);

const parseMultiUsersSelect = ({
  actionId,
  blockId,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly stateValues: unknown;
}): readonly string[] | null => {
  const block = getRecordValue({
    key: blockId,
    value: stateValues,
  });
  const action = getRecordValue({
    key: actionId,
    value: block,
  });
  const selectedUsers = getRecordValue({
    key: 'selected_users',
    value: action,
  });

  if (!Array.isArray(selectedUsers)) {
    return null;
  }

  return selectedUsers.filter(
    (user): user is string => typeof user === 'string' && user.length > 0
  );
};

export const parseManageAdminsUsers = (
  stateValues: unknown
): readonly string[] | null =>
  parseMultiUsersSelect({
    actionId: slackActionIds.manageAdminsUsers,
    blockId: slackBlockIds.manageAdminsUsers,
    stateValues,
  });

export const parseManageAdminsChannelOwnerEditors = (
  stateValues: unknown
): readonly string[] | null =>
  parseMultiUsersSelect({
    actionId: slackActionIds.manageAdminsChannelOwnerEditors,
    blockId: slackBlockIds.manageAdminsChannelOwnerEditors,
    stateValues,
  });
