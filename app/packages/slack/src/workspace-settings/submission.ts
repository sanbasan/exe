import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';
import { languageSchema, type Language } from '@exe/domain';

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

const parseStaticSelectValue = ({
  actionId,
  blockId,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly stateValues: unknown;
}): string | null => {
  const block = getRecordValue({ key: blockId, value: stateValues });
  const action = getRecordValue({ key: actionId, value: block });
  const selectedOption = getRecordValue({
    key: 'selected_option',
    value: action,
  });
  const value = getRecordValue({ key: 'value', value: selectedOption });

  return typeof value === 'string' && value.length > 0 ? value : null;
};

export const parseWorkspaceSettingsLanguage = (
  stateValues: unknown
): Language | null => {
  const language = parseStaticSelectValue({
    actionId: slackActionIds.workspaceSettingsLanguage,
    blockId: slackBlockIds.workspaceSettingsLanguage,
    stateValues,
  });
  const result = languageSchema.safeParse(language);

  return result.success ? result.data : null;
};

export const parseWorkspaceSettingsTimezone = (
  stateValues: unknown
): string | null =>
  parseStaticSelectValue({
    actionId: slackActionIds.workspaceSettingsTimezone,
    blockId: slackBlockIds.workspaceSettingsTimezone,
    stateValues,
  });
