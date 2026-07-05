import { createChannelBlockMethods } from './channel-block-methods';
import { createChannelReadMethods } from './channel-read-methods';
import { createChannelReviewMethods } from './channel-review-methods';
import {
  type ChannelService,
  type ChannelServiceDeps,
} from './channel-service-contract';
import { createChannelWriteMethods } from './channel-write-methods';

export type {
  ChannelService,
  ChannelServiceDeps,
  CreateChannelBlockInput,
  PatchChannelInput,
  RecordChannelReviewInput,
  UpdateChannelBlockInput,
} from './channel-service-contract';

export const createChannelService = (
  deps: ChannelServiceDeps
): ChannelService => ({
  ...createChannelBlockMethods(deps),
  ...createChannelReadMethods(deps),
  ...createChannelReviewMethods(deps),
  ...createChannelWriteMethods(deps),
});
