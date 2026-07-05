import type { Clock, DeviceTokenRepository } from '#server/ports';
import {
  deviceTokenSchema,
  type DeviceToken,
  type Environment,
} from '@exe/domain';
import { createHash } from 'node:crypto';

export interface DeviceTokenService {
  readonly registerIosDeviceToken: (params: {
    readonly environment: Environment;
    readonly kind: DeviceToken['kind'];
    readonly token: string;
    readonly userId: string;
  }) => Promise<DeviceToken>;
}

const buildDeviceTokenId = ({
  environment,
  kind,
  token,
}: {
  readonly environment: Environment;
  readonly kind: DeviceToken['kind'];
  readonly token: string;
}): string => {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  return `device_token_${environment}_${kind}_${tokenHash}`;
};

export const createDeviceTokenService = ({
  clock,
  deviceTokenRepository,
}: {
  readonly clock: Clock;
  readonly deviceTokenRepository: DeviceTokenRepository;
}): DeviceTokenService => ({
  registerIosDeviceToken: async ({
    environment,
    kind,
    token,
    userId,
  }): Promise<DeviceToken> => {
    const now = clock.now();
    const deviceToken = deviceTokenSchema.parse({
      createdAt: now,
      environment,
      id: buildDeviceTokenId({ environment, kind, token }),
      kind,
      platform: 'ios',
      token,
      updatedAt: now,
      userId,
    });

    await deviceTokenRepository.removeByRegistration({
      environment,
      kind,
      token,
    });
    await deviceTokenRepository.upsert({ deviceToken });

    return deviceToken;
  },
});
