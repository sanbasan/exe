import { slackActionIds, slackBlockIds } from '#slack/contracts/ids';

const jsonMetadataTaskIdPattern = /"taskId"\s*:\s*"([^"]+)"/u;
const jsonMetadataPrefix = '{';

export interface EditTaskModalPrivateMetadata {
  readonly taskId: string;
}

export interface EditTaskSubmissionValues {
  readonly assigneeSlackUserIds: readonly string[];
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly requesterSlackUserIds: readonly string[];
  readonly title: string | null;
}

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

const getActionValue = ({
  actionId,
  blockId,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly stateValues: unknown;
}): unknown =>
  getRecordValue({
    key: actionId,
    value: getRecordValue({ key: blockId, value: stateValues }),
  });

const getStringProperty = ({
  key,
  value,
}: {
  readonly key: string;
  readonly value: unknown;
}): string | null => {
  const property = getRecordValue({ key, value });

  return typeof property === 'string' && property.length > 0 ? property : null;
};

const getSelectedUsers = ({
  actionId,
  blockId,
  stateValues,
}: {
  readonly actionId: string;
  readonly blockId: string;
  readonly stateValues: unknown;
}): readonly string[] => {
  const actionValue = getActionValue({ actionId, blockId, stateValues });
  const selectedUsers = getRecordValue({
    key: 'selected_users',
    value: actionValue,
  });

  if (!Array.isArray(selectedUsers)) {
    return [];
  }

  return selectedUsers.filter(
    (user): user is string => typeof user === 'string' && user.length > 0
  );
};

const parseLegacyJsonMetadataTaskId = (metadata: string): string | null => {
  const matchedTaskId = jsonMetadataTaskIdPattern.exec(metadata)?.[1];

  if (matchedTaskId === undefined || matchedTaskId.length === 0) {
    return null;
  }

  return matchedTaskId;
};

export const parseEditTaskModalPrivateMetadata = (
  metadata: string
): EditTaskModalPrivateMetadata | null => {
  const trimmedMetadata = metadata.trim();

  if (trimmedMetadata.length === 0) {
    return null;
  }

  if (trimmedMetadata.startsWith(jsonMetadataPrefix)) {
    const taskId = parseLegacyJsonMetadataTaskId(trimmedMetadata);

    return taskId === null ? null : { taskId };
  }

  return { taskId: trimmedMetadata };
};

export const parseEditTaskSubmissionValues = (
  stateValues: unknown
): EditTaskSubmissionValues => {
  const titleAction = getActionValue({
    actionId: slackActionIds.taskEditTitle,
    blockId: slackBlockIds.taskEditTitle,
    stateValues,
  });
  const dueDateAction = getActionValue({
    actionId: slackActionIds.taskEditDueDate,
    blockId: slackBlockIds.taskEditDueDate,
    stateValues,
  });
  const dueTimeAction = getActionValue({
    actionId: slackActionIds.taskEditDueTime,
    blockId: slackBlockIds.taskEditDueTime,
    stateValues,
  });

  return {
    assigneeSlackUserIds: getSelectedUsers({
      actionId: slackActionIds.taskEditAssignees,
      blockId: slackBlockIds.taskEditAssignees,
      stateValues,
    }),
    dueDate: getStringProperty({ key: 'selected_date', value: dueDateAction }),
    dueTime: getStringProperty({ key: 'selected_time', value: dueTimeAction }),
    requesterSlackUserIds: getSelectedUsers({
      actionId: slackActionIds.taskEditRequesters,
      blockId: slackBlockIds.taskEditRequesters,
      stateValues,
    }),
    title: getStringProperty({ key: 'value', value: titleAction }),
  };
};
