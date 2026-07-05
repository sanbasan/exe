import type { Clock, DeviceTokenRepository } from '../src/ports';
import { createDeviceTokenService } from '../src/services/device-token-service';
import { type DeviceToken } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-07-01T00:00:00.000Z';
const clock: Clock = { now: () => NOW };

class RecordingDeviceTokenRepository implements DeviceTokenRepository {
  public tokens: readonly DeviceToken[] = [];

  public removedRegistrations: {
    readonly environment: DeviceToken['environment'];
    readonly kind: DeviceToken['kind'];
    readonly token: string;
  }[] = [];

  public listByUser = async ({
    userId,
  }: {
    readonly userId: string;
  }): Promise<readonly DeviceToken[]> =>
    this.tokens.filter((token) => token.userId === userId);

  public removeByRegistration = async (params: {
    readonly environment: DeviceToken['environment'];
    readonly kind: DeviceToken['kind'];
    readonly token: string;
  }): Promise<void> => {
    this.removedRegistrations = [...this.removedRegistrations, params];
    this.tokens = this.tokens.filter(
      (token) =>
        token.environment !== params.environment ||
        token.kind !== params.kind ||
        token.token !== params.token
    );
  };

  public removeByTokens = async ({
    tokens,
  }: {
    readonly tokens: readonly string[];
  }): Promise<void> => {
    this.tokens = this.tokens.filter((token) => !tokens.includes(token.token));
  };

  public upsert = async ({
    deviceToken,
  }: {
    readonly deviceToken: DeviceToken;
  }): Promise<void> => {
    this.tokens = [
      ...this.tokens.filter((token) => token.id !== deviceToken.id),
      deviceToken,
    ];
  };
}

test('device token registration uses a stable id and replaces duplicates', async () => {
  const repository = new RecordingDeviceTokenRepository();
  const service = createDeviceTokenService({
    clock,
    deviceTokenRepository: repository,
  });

  const first = await service.registerIosDeviceToken({
    environment: 'prod',
    kind: 'voip',
    token: 'token-1',
    userId: 'user-1',
  });
  const second = await service.registerIosDeviceToken({
    environment: 'prod',
    kind: 'voip',
    token: 'token-1',
    userId: 'user-1',
  });

  assert.equal(first.id, second.id);
  assert.match(first.id, /^device_token_prod_voip_[a-f0-9]{64}$/u);
  assert.deepEqual(
    repository.tokens.map((token) => token.id),
    [first.id]
  );
  assert.equal(repository.removedRegistrations.length, 2);
});

test('device token registration moves token ownership to the latest user', async () => {
  const repository = new RecordingDeviceTokenRepository();
  const service = createDeviceTokenService({
    clock,
    deviceTokenRepository: repository,
  });

  await service.registerIosDeviceToken({
    environment: 'dev',
    kind: 'fcm',
    token: 'token-2',
    userId: 'old-user',
  });
  const latest = await service.registerIosDeviceToken({
    environment: 'dev',
    kind: 'fcm',
    token: 'token-2',
    userId: 'new-user',
  });

  assert.deepEqual(await repository.listByUser({ userId: 'old-user' }), []);
  assert.deepEqual(await repository.listByUser({ userId: 'new-user' }), [
    latest,
  ]);
});
