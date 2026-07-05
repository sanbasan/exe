import type { CallNotificationRecord } from '#server/ports';
import type { CallWorkflowDeps } from './deps';

const FIRESTORE_ALREADY_EXISTS_CODE = 6;
const DOCUMENT_ID_PATTERN = /[^A-Za-z0-9_-]/gu;

const toDocumentIdPart = (value: string): string =>
  value.replace(DOCUMENT_ID_PATTERN, '_');

const isAlreadyExistsError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('code' in error)) {
    return false;
  }

  const code = error.code;

  return code === FIRESTORE_ALREADY_EXISTS_CODE || code === 'already-exists';
};

export const buildCallNotificationId = (parts: readonly string[]): string =>
  `call_notification_${parts.map(toDocumentIdPart).join('_')}`;

export const tryCreateCallNotification = ({
  deps,
  record,
}: {
  readonly deps: CallWorkflowDeps;
  readonly record: CallNotificationRecord;
}): Promise<boolean> =>
  deps.callNotificationRepository
    .create({ record })
    .then((): boolean => true)
    .catch((error: unknown): boolean => {
      if (isAlreadyExistsError(error)) {
        return false;
      }

      throw error;
    });
