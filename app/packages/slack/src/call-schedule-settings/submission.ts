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

const getActionState = ({
  actionId,
  blockId,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly stateValues: unknown;
}): unknown => {
  const block = getRecordValue({ key: blockId, value: stateValues });

  return getRecordValue({ key: actionId, value: block });
};

const isSelectedOption = (
  value: unknown
): value is { readonly value: string } =>
  isUnknownRecord(value) && typeof value['value'] === 'string';

const getSelectedOptionValues = (actionState: unknown): readonly string[] => {
  const selectedOptions = getRecordValue({
    key: 'selected_options',
    value: actionState,
  });

  return Array.isArray(selectedOptions)
    ? selectedOptions
        .filter(isSelectedOption)
        .map((option) => option.value)
        .filter((value) => value.length > 0)
    : [];
};

export const parseCallScheduleEnabled = (stateValues: unknown): boolean =>
  getSelectedOptionValues(
    getActionState({
      actionId: slackActionIds.callScheduleEnabled,
      blockId: slackBlockIds.callScheduleEnabled,
      stateValues,
    })
  ).includes('enabled');

export const parseCallScheduleTime = (stateValues: unknown): string | null => {
  const selectedTime = getRecordValue({
    key: 'selected_time',
    value: getActionState({
      actionId: slackActionIds.callScheduleTime,
      blockId: slackBlockIds.callScheduleTime,
      stateValues,
    }),
  });

  return typeof selectedTime === 'string' && selectedTime.length > 0
    ? selectedTime
    : null;
};

export const parseCallScheduleSkippedDates = (
  stateValues: unknown
): readonly string[] =>
  getSelectedOptionValues(
    getActionState({
      actionId: slackActionIds.callScheduleSkippedDates,
      blockId: slackBlockIds.callScheduleSkippedDates,
      stateValues,
    })
  );
