/* eslint-disable max-lines -- Agenda formatting helpers are kept together for reviewability. */
import {
  classifyDueAt,
  isChannelReviewDue,
  type CallAgenda,
  type ChannelReviewAgendaItem,
  type DueReminderCategory,
  type FollowUpTask,
  type WorkTask,
} from '@exe/domain';

const dueReminderLabel = ({
  category,
  language,
}: {
  readonly category: DueReminderCategory;
  readonly language: 'en' | 'ja';
}): string | null => {
  switch (category) {
    case 'later':
      return null;
    case 'overdue':
      return language === 'ja' ? '期限超過' : 'OVERDUE';
    case 'today':
      return language === 'ja' ? '締め切り当日' : 'due today';
    case 'tomorrow':
      return language === 'ja'
        ? '締め切り前日（明日締め切り）'
        : 'due tomorrow';
  }
};

// includeIds: the assistant (tool-caller) prompt shows internal record IDs so
// its tools can target exact records; the voice prompt hides them so the
// realtime model can only ever reference things by title/name.
const formatSlackUsers = ({
  ids,
  includeIds,
  memberNames,
}: {
  readonly ids: readonly string[];
  readonly includeIds: boolean;
  readonly memberNames: ReadonlyMap<string, string>;
}): string =>
  ids.length === 0
    ? 'none'
    : ids
        .map((id) => {
          const name = memberNames.get(id);

          if (name === undefined) {
            return id;
          }

          return includeIds ? `${name} (${id})` : name;
        })
        .join(', ');

const describeTaskChannel = ({
  agenda,
  channelId,
}: {
  readonly agenda: CallAgenda;
  readonly channelId?: string;
}): string => {
  if (channelId === undefined) {
    return 'channel: none';
  }

  const name = agenda.channels.find(
    (channel) => channel.channelId === channelId
  )?.name;

  return name === undefined ? `channelId: ${channelId}` : `channel: #${name}`;
};

// Raw task fields, unabridged: the agent must see everything the user sees in
// the app (due date, status, people, channel), not a thinned-out title line.
const describeWorkTask = ({
  agenda,
  includeIds,
  memberNames,
  task,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly task: WorkTask;
}): string => {
  const category = classifyDueAt({
    ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
    now: agenda.now,
    timezone: agenda.timezone,
  });
  const label =
    category === null
      ? null
      : dueReminderLabel({ category, language: agenda.language });
  const due =
    task.dueAt === undefined
      ? 'due: none'
      : label === null
        ? `due: ${task.dueAt}`
        : `due: ${task.dueAt} [${label}]`;

  return [
    `status: ${task.status}`,
    due,
    `assignees: ${formatSlackUsers({ ids: task.assigneeSlackUserIds, includeIds, memberNames })}`,
    `requesters: ${formatSlackUsers({ ids: task.requesterSlackUserIds, includeIds, memberNames })}`,
    describeTaskChannel({
      agenda,
      ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
    }),
    `created: ${task.createdAt}`,
  ].join(' | ');
};

const describeFollowUpTask = ({
  agenda,
  includeIds,
  memberNames,
  task,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly task: FollowUpTask;
}): string =>
  [
    `status: ${task.status}`,
    `assignees: ${formatSlackUsers({ ids: task.assigneeSlackUserIds, includeIds, memberNames })}`,
    `requesters: ${formatSlackUsers({ ids: task.requesterSlackUserIds, includeIds, memberNames })}`,
    describeTaskChannel({
      agenda,
      ...(task.channelId === undefined ? {} : { channelId: task.channelId }),
    }),
    `created: ${task.createdAt}`,
  ].join(' | ');

const taskIdSuffix = ({
  id,
  includeIds,
}: {
  readonly id: string;
  readonly includeIds: boolean;
}): string => (includeIds ? ` (task ID: ${id})` : '');

export const formatWorkTaskLine = ({
  agenda,
  includeIds,
  index,
  memberNames,
  task,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly index: number;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly task: WorkTask;
}): string =>
  `${String(index + 1)}. ${task.title}${taskIdSuffix({ id: task.id, includeIds })} — ${describeWorkTask({ agenda, includeIds, memberNames, task })}`;

export const formatFollowUpTaskLine = ({
  agenda,
  includeIds,
  index,
  memberNames,
  task,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly index: number;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly task: FollowUpTask;
}): string =>
  `${String(index + 1)}. ${task.title} — ${task.followUpQuestion}${taskIdSuffix({ id: task.id, includeIds })} — ${describeFollowUpTask({ agenda, includeIds, memberNames, task })}`;

export const findFocusTask = (agenda: CallAgenda): WorkTask | null => {
  if (agenda.focusTaskId === undefined) {
    return null;
  }

  return (
    [...agenda.workTasks, ...agenda.requestedWorkTasks].find(
      (task) => task.id === agenda.focusTaskId
    ) ?? null
  );
};

const formatChannelLine = ({
  channelId,
  index,
  latestInfo,
  latestInfoUpdatedAt,
  name,
}: {
  readonly channelId: string;
  readonly index: number;
  readonly latestInfo?: string;
  readonly latestInfoUpdatedAt?: string;
  readonly name: string;
}): string => {
  const heading = `${String(index + 1)}. #${name} (channel ID: ${channelId})`;

  if (latestInfo === undefined) {
    return `${heading} — (current state: not recorded yet)`;
  }

  return `${heading} — current state: ${latestInfo} (last updated: ${
    latestInfoUpdatedAt ?? 'unknown'
  })`;
};

export const formatChannelSection = ({
  channels,
  emptyText,
}: {
  readonly channels: CallAgenda['channels'];
  readonly emptyText: string;
}): string =>
  channels.length === 0
    ? emptyText
    : channels
        .map((channel, index) =>
          formatChannelLine({
            channelId: channel.channelId,
            index,
            ...(channel.latestInfo === undefined
              ? {}
              : { latestInfo: channel.latestInfo }),
            ...(channel.latestInfoUpdatedAt === undefined
              ? {}
              : { latestInfoUpdatedAt: channel.latestInfoUpdatedAt }),
            name: channel.name,
          })
        )
        .join('\n');

const formatReviewWorkTaskBullet = ({
  agenda,
  includeIds,
  memberNames,
  task,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly task: WorkTask;
}): string =>
  `       • ${task.title}${taskIdSuffix({ id: task.id, includeIds })} — ${describeWorkTask({ agenda, includeIds, memberNames, task })}`;

const formatChannelReviewItem = ({
  agenda,
  includeIds,
  index,
  item,
  memberNames,
}: {
  readonly agenda: CallAgenda;
  readonly includeIds: boolean;
  readonly index: number;
  readonly item: ChannelReviewAgendaItem;
  readonly memberNames: ReadonlyMap<string, string>;
}): string => {
  const {
    assignedWorkTasks,
    channel,
    otherActiveWorkTasks,
    requestedWorkTasks,
    reviewState,
  } = item;
  const lines: readonly (string | null)[] = [
    `${String(index + 1)}. #${channel.name} (channel ID: ${channel.channelId})`,
    `   - current state: ${channel.latestInfo ?? '(not recorded yet)'}`,
    assignedWorkTasks.length === 0
      ? '   - assigned tasks: none'
      : `   - assigned tasks:\n${assignedWorkTasks
          .map((task) =>
            formatReviewWorkTaskBullet({
              agenda,
              includeIds,
              memberNames,
              task,
            })
          )
          .join('\n')}`,
    requestedWorkTasks.length === 0
      ? '   - requested tasks: none'
      : `   - requested tasks:\n${requestedWorkTasks
          .map((task) =>
            formatReviewWorkTaskBullet({
              agenda,
              includeIds,
              memberNames,
              task,
            })
          )
          .join('\n')}`,
    otherActiveWorkTasks.length === 0
      ? null
      : `   - other members' active tasks in this channel:\n${otherActiveWorkTasks
          .map((task) =>
            formatReviewWorkTaskBullet({
              agenda,
              includeIds,
              memberNames,
              task,
            })
          )
          .join('\n')}`,
    `   - last checked by you: ${reviewState?.lastCheckedAt ?? '(never)'}`,
    reviewState?.lastSelfReport === undefined
      ? null
      : `   - your last self report: ${reviewState.lastSelfReport}`,
    reviewState?.nextCheckAt === undefined
      ? null
      : `   - your planned next check: ${reviewState.nextCheckAt}`,
    item.completedWorkTasksSinceLastCheck.length === 0
      ? null
      : `   - your tasks completed since last check:\n${item.completedWorkTasksSinceLastCheck
          .map((task) =>
            formatReviewWorkTaskBullet({
              agenda,
              includeIds,
              memberNames,
              task,
            })
          )
          .join('\n')}`,
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
};

// Splits the user's channels into those due for review on this call and those
// whose planned next-check date has not arrived yet (skipped this time).
export const partitionChannelReviewItems = ({
  agenda,
  items,
}: {
  readonly agenda: CallAgenda;
  readonly items: readonly ChannelReviewAgendaItem[];
}): {
  readonly due: readonly ChannelReviewAgendaItem[];
  readonly skipped: readonly ChannelReviewAgendaItem[];
} => {
  const isDue = (item: ChannelReviewAgendaItem): boolean => {
    const nextCheckAt = item.reviewState?.nextCheckAt;

    return isChannelReviewDue({
      ...(nextCheckAt === undefined ? {} : { nextCheckAt }),
      now: agenda.now,
      timezone: agenda.timezone,
    });
  };

  return {
    due: items.filter(isDue),
    skipped: items.filter((item) => !isDue(item)),
  };
};

export const formatSkippedChannelReviewSection = ({
  items,
}: {
  readonly items: readonly ChannelReviewAgendaItem[];
}): string =>
  items
    .map((item) => {
      const reason = item.reviewState?.nextCheckReason;

      return `- #${item.channel.name} (channel ID: ${item.channel.channelId}) — next check planned: ${
        item.reviewState?.nextCheckAt ?? 'unknown'
      }${reason === undefined ? '' : ` (reason: ${reason})`}`;
    })
    .join('\n');

export const formatChannelReviewSection = ({
  agenda,
  emptyText = 'You are not responsible for any active channels.',
  includeIds,
  items,
  memberNames,
}: {
  readonly agenda: CallAgenda;
  readonly emptyText?: string;
  readonly includeIds: boolean;
  readonly items: readonly ChannelReviewAgendaItem[];
  readonly memberNames: ReadonlyMap<string, string>;
}): string =>
  items.length === 0
    ? emptyText
    : items
        .map((item, index) =>
          formatChannelReviewItem({
            agenda,
            includeIds,
            index,
            item,
            memberNames,
          })
        )
        .join('\n\n');

export const formatMembersSection = ({
  memberNames,
}: {
  readonly memberNames: ReadonlyMap<string, string>;
}): string =>
  memberNames.size === 0
    ? 'The member list could not be loaded for this call. Use get_channel_participants when you need Slack user IDs.'
    : [...memberNames.entries()]
        .map(([id, name]) => `- ${name} (Slack user ID: ${id})`)
        .join('\n');
