import {
  channelsResponseSchema,
  meetingResponseSchema,
  meetingsResponseSchema,
  membersResponseSchema,
  taskResponseSchema,
  tasksResponseSchema,
  workspacesResponseSchema,
  type ChannelSummary,
  type Meeting,
  type SlackMember,
  type WorkspaceSummary,
} from '#app/web/api-schemas';
import { requestJson } from '#app/web/http';
import { isWorkTask, type WorkTask, type WorkTaskPatch } from '@exe/domain';
import { z } from 'zod';

export { isApiError, type ApiError } from '#app/web/http';

export interface CreateTaskInput {
  readonly assigneeSlackUserIds: readonly string[];
  readonly channelId?: string;
  readonly description?: string;
  readonly dueAt?: string;
  readonly requesterSlackUserIds?: readonly string[];
  readonly startAt?: string;
  readonly title: string;
}

export interface CreateMeetingInput {
  readonly audioBase64: string;
  readonly channelId?: string;
  readonly durationSeconds: number;
  readonly mimeType: string;
  readonly participantSlackUserIds?: readonly string[];
}

const workspacePath = ({
  workspaceId,
}: {
  readonly workspaceId: string;
}): string => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export const sendLoginCode = async ({
  email,
}: {
  readonly email: string;
}): Promise<void> => {
  await requestJson({
    auth: false,
    body: { email, language: 'en' },
    method: 'POST',
    path: '/api/v1/auth/send-code',
  });
};

export const verifyLoginCode = async ({
  code,
  email,
}: {
  readonly code: string;
  readonly email: string;
}): Promise<string> => {
  const json = await requestJson({
    auth: false,
    body: { code, email },
    method: 'POST',
    path: '/api/v1/auth/verify-code',
  });
  return z.object({ customToken: z.string().min(1) }).parse(json).customToken;
};

export const getWorkspaces = async (): Promise<readonly WorkspaceSummary[]> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: '/api/v1/workspaces',
  });
  return workspacesResponseSchema.parse(json);
};

export const getTasks = async ({
  workspaceId,
}: {
  readonly workspaceId: string;
}): Promise<readonly WorkTask[]> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: `${workspacePath({ workspaceId })}/tasks/all`,
  });
  return tasksResponseSchema.parse(json).filter((task) => isWorkTask(task));
};

export const createTask = async ({
  input,
  workspaceId,
}: {
  readonly input: CreateTaskInput;
  readonly workspaceId: string;
}): Promise<WorkTask> => {
  const json = await requestJson({
    auth: true,
    body: input,
    method: 'POST',
    path: `${workspacePath({ workspaceId })}/tasks`,
  });
  const task = taskResponseSchema.parse(json);
  if (!isWorkTask(task)) {
    throw new Error('Expected a work task.');
  }
  return task;
};

export const updateTask = async ({
  after,
  taskId,
  workspaceId,
}: {
  readonly after: WorkTaskPatch;
  readonly taskId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await requestJson({
    auth: true,
    body: { after, taskId },
    method: 'PATCH',
    path: `${workspacePath({ workspaceId })}/tasks/${encodeURIComponent(taskId)}`,
  });
};

export const addDependency = async ({
  blockerTaskId,
  taskId,
  workspaceId,
}: {
  readonly blockerTaskId: string;
  readonly taskId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await requestJson({
    auth: true,
    body: { blockerTaskId },
    method: 'POST',
    path: `${workspacePath({ workspaceId })}/tasks/${encodeURIComponent(taskId)}/dependencies`,
  });
};

export const removeDependency = async ({
  blockerTaskId,
  taskId,
  workspaceId,
}: {
  readonly blockerTaskId: string;
  readonly taskId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await requestJson({
    auth: true,
    method: 'DELETE',
    path: `${workspacePath({ workspaceId })}/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(blockerTaskId)}`,
  });
};

export const getChannels = async ({
  workspaceId,
}: {
  readonly workspaceId: string;
}): Promise<readonly ChannelSummary[]> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: `${workspacePath({ workspaceId })}/channels`,
  });
  return channelsResponseSchema.parse(json);
};

export const getSlackMembers = async ({
  workspaceId,
}: {
  readonly workspaceId: string;
}): Promise<readonly SlackMember[]> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: `${workspacePath({ workspaceId })}/slack-members`,
  });
  return membersResponseSchema.parse(json);
};

export const createMeeting = async ({
  input,
  workspaceId,
}: {
  readonly input: CreateMeetingInput;
  readonly workspaceId: string;
}): Promise<Meeting> => {
  const json = await requestJson({
    auth: true,
    body: input,
    method: 'POST',
    path: `${workspacePath({ workspaceId })}/meetings`,
  });
  return meetingResponseSchema.parse(json);
};

export const getMeetings = async ({
  workspaceId,
}: {
  readonly workspaceId: string;
}): Promise<readonly Meeting[]> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: `${workspacePath({ workspaceId })}/meetings`,
  });
  return meetingsResponseSchema.parse(json);
};

export const getMeeting = async ({
  meetingId,
  workspaceId,
}: {
  readonly meetingId: string;
  readonly workspaceId: string;
}): Promise<Meeting> => {
  const json = await requestJson({
    auth: true,
    method: 'GET',
    path: `${workspacePath({ workspaceId })}/meetings/${encodeURIComponent(meetingId)}`,
  });
  return meetingResponseSchema.parse(json);
};
