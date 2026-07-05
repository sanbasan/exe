export const taskOverflowActions = {
  cancel: 'cancel',
  channelSettings: 'channel_settings',
  edit: 'edit',
} as const;

export type TaskOverflowAction =
  (typeof taskOverflowActions)[keyof typeof taskOverflowActions];

const isTaskOverflowAction = (value: string): value is TaskOverflowAction => {
  switch (value) {
    case taskOverflowActions.cancel:
    case taskOverflowActions.channelSettings:
    case taskOverflowActions.edit:
      return true;
    default:
      return false;
  }
};

export const buildTaskOverflowActionValue = ({
  action,
  taskId,
}: {
  readonly action: TaskOverflowAction;
  readonly taskId: string;
}): string => `${action}:${taskId}`;

export const parseTaskOverflowActionValue = (
  selectedValue: string
): { readonly action: TaskOverflowAction; readonly taskId: string } | null => {
  const separatorIndex = selectedValue.indexOf(':');

  if (separatorIndex === -1) {
    return null;
  }

  const action = selectedValue.slice(0, separatorIndex);
  const taskId = selectedValue.slice(separatorIndex + 1);

  if (!isTaskOverflowAction(action) || taskId.length === 0) {
    return null;
  }

  return { action, taskId };
};
