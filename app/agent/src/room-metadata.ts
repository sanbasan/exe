import {
  callPurposeSchema,
  languageSchema,
  type CallPurpose,
  type Language,
} from '@exe/domain';
import { serverConfig } from '@exe/server';

export interface ExeRoomMetadata {
  readonly language: Language;
  readonly purpose: CallPurpose;
  readonly sessionId: string;
  readonly workspaceId: string;
}

const isStringRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseRoomMetadata = ({
  rawMetadata,
}: {
  readonly rawMetadata?: string;
}): ExeRoomMetadata => {
  if (rawMetadata === undefined || rawMetadata.length === 0) {
    throw new Error('Room metadata is missing.');
  }

  const parsed: unknown = JSON.parse(rawMetadata);

  if (
    !isStringRecord(parsed) ||
    !languageSchema.safeParse(parsed['language']).success ||
    !callPurposeSchema.safeParse(parsed['purpose']).success ||
    typeof parsed['sessionId'] !== 'string' ||
    typeof parsed['workspaceId'] !== 'string'
  ) {
    throw new Error('Room metadata is invalid.');
  }

  return {
    language: languageSchema.parse(parsed['language']),
    purpose: callPurposeSchema.parse(parsed['purpose']),
    sessionId: parsed['sessionId'],
    workspaceId: parsed['workspaceId'],
  };
};

export const extractSessionIdFromRoomName = (roomName: string): string => {
  const prefix = serverConfig.livekit.roomNamePrefix;

  if (!roomName.startsWith(prefix)) {
    throw new Error(`Unexpected room name format: ${roomName}`);
  }

  return roomName.slice(prefix.length);
};
