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

export const parseChannelSettingsAssignees = (
  stateValues: unknown
): readonly string[] | null => {
  const block = getRecordValue({
    key: slackBlockIds.channelSettingsAssignees,
    value: stateValues,
  });
  const action = getRecordValue({
    key: slackActionIds.channelSettingsAssignees,
    value: block,
  });
  const selectedUsers = getRecordValue({
    key: 'selected_users',
    value: action,
  });

  if (!Array.isArray(selectedUsers)) {
    return null;
  }

  const assignees = selectedUsers.filter(
    (user): user is string => typeof user === 'string' && user.length > 0
  );

  return assignees.length === 0 ? null : assignees;
};
