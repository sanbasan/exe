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

export const parseChannelWatchSettingsSelectedChannels = (
  stateValues: unknown
): readonly string[] | null => {
  const block = getRecordValue({
    key: slackBlockIds.channelWatchSettingsChannels,
    value: stateValues,
  });
  const action = getRecordValue({
    key: slackActionIds.channelWatchSettingsChannels,
    value: block,
  });
  const selectedOptions = getRecordValue({
    key: 'selected_options',
    value: action,
  });

  if (!Array.isArray(selectedOptions)) {
    return [];
  }

  return selectedOptions.flatMap((option) => {
    const value = getRecordValue({ key: 'value', value: option });

    return typeof value === 'string' && value.length > 0 ? [value] : [];
  });
};
