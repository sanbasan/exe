import type {
  CallEventRepository,
  CallNotificationRepository,
  CallScheduleRepository,
  CallSessionRepository,
  ChannelBlockRepository,
  ChannelEventRepository,
  ChannelRepository,
  ChannelReviewStateRepository,
  DeviceTokenRepository,
  MeetingRepository,
  OverdueTaskNotificationRepository,
  SignInCodeRepository,
  SlackMemberIndexRepository,
  TaskRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from '#server/ports';
import {
  createFirestoreCallEventRepository,
  createFirestoreCallNotificationRepository,
  createFirestoreCallScheduleRepository,
  createFirestoreCallSessionRepository,
} from './call-repositories';
import {
  createFirestoreChannelEventRepository,
  createFirestoreChannelRepository,
} from './channel-repositories';
import {
  createFirestoreChannelBlockRepository,
  createFirestoreChannelReviewStateRepository,
} from './channel-review-repositories';
import { createFirestoreDeviceTokenRepository } from './device-token-repository';
import { createFirestoreMeetingRepository } from './meeting-repository';
import { createFirestoreOverdueTaskNotificationRepository } from './overdue-task-notification-repository';
import { createFirestoreSignInCodeRepository } from './sign-in-code-repository';
import { createFirestoreSlackMemberIndexRepository } from './slack-member-index-repository';
import { createFirestoreTaskRepository } from './task-repository';
import { createFirestoreUserProfileRepository } from './user-profile-repository';
import { createFirestoreWorkspaceRepository } from './workspace-repository';
import type { Firestore } from 'firebase-admin/firestore';

export interface FirestoreRepositories {
  readonly callEventRepository: CallEventRepository;
  readonly callNotificationRepository: CallNotificationRepository;
  readonly callScheduleRepository: CallScheduleRepository;
  readonly callSessionRepository: CallSessionRepository;
  readonly channelBlockRepository: ChannelBlockRepository;
  readonly channelEventRepository: ChannelEventRepository;
  readonly channelRepository: ChannelRepository;
  readonly channelReviewStateRepository: ChannelReviewStateRepository;
  readonly deviceTokenRepository: DeviceTokenRepository;
  readonly meetingRepository: MeetingRepository;
  readonly overdueTaskNotificationRepository: OverdueTaskNotificationRepository;
  readonly signInCodeRepository: SignInCodeRepository;
  readonly slackMemberIndexRepository: SlackMemberIndexRepository;
  readonly taskRepository: TaskRepository;
  readonly userProfileRepository: UserProfileRepository;
  readonly workspaceRepository: WorkspaceRepository;
}

export const createFirestoreRepositories = ({
  firestore,
}: {
  readonly firestore: Firestore;
}): FirestoreRepositories => ({
  callEventRepository: createFirestoreCallEventRepository({ firestore }),
  callNotificationRepository: createFirestoreCallNotificationRepository({
    firestore,
  }),
  callScheduleRepository: createFirestoreCallScheduleRepository({ firestore }),
  callSessionRepository: createFirestoreCallSessionRepository({ firestore }),
  channelBlockRepository: createFirestoreChannelBlockRepository({ firestore }),
  channelEventRepository: createFirestoreChannelEventRepository({ firestore }),
  channelRepository: createFirestoreChannelRepository({ firestore }),
  channelReviewStateRepository: createFirestoreChannelReviewStateRepository({
    firestore,
  }),
  deviceTokenRepository: createFirestoreDeviceTokenRepository({ firestore }),
  meetingRepository: createFirestoreMeetingRepository({ firestore }),
  overdueTaskNotificationRepository:
    createFirestoreOverdueTaskNotificationRepository({ firestore }),
  signInCodeRepository: createFirestoreSignInCodeRepository({ firestore }),
  slackMemberIndexRepository: createFirestoreSlackMemberIndexRepository({
    firestore,
  }),
  taskRepository: createFirestoreTaskRepository({ firestore }),
  userProfileRepository: createFirestoreUserProfileRepository({ firestore }),
  workspaceRepository: createFirestoreWorkspaceRepository({ firestore }),
});
