import {
  callDataChannelMessageSchema,
  type CallDataChannelMessage,
} from '@exe/domain';
import type { JobContext } from '@livekit/agents';

const encoder = new TextEncoder();

export interface CallDataRoom {
  readonly localParticipant?: JobContext['room']['localParticipant'];
}

export const publishCallData = async ({
  message,
  room,
  topic,
}: {
  readonly message: CallDataChannelMessage;
  readonly room: CallDataRoom;
  readonly topic: string;
}): Promise<void> => {
  const participant = room.localParticipant;

  if (participant === undefined) {
    return;
  }

  const payload = encoder.encode(
    JSON.stringify(callDataChannelMessageSchema.parse(message))
  );

  await participant.publishData(payload, {
    reliable: true,
    topic,
  });
};
