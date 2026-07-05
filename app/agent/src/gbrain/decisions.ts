import type { CallAgenda, CallEvent, Language } from '@exe/domain';
import {
  getIncomingFollowUpDrafts,
  getIncomingLatestInfoDrafts,
  getIncomingPatches,
  getIncomingWorkTaskDrafts,
} from '@exe/server';

// Derives the call's concrete outcomes (created/updated tasks, follow-ups, and
// latest-info updates) from the recorded call events, so the GBrain page can
// carry a "Decisions" section, outcome tags, and channel wikilinks that the
// graph engine can auto-link on ingest.

export interface CallDecisions {
  readonly channelNames: readonly string[];
  readonly lines: readonly string[];
  readonly outcomeTags: readonly string[];
}

export const buildCallDecisions = ({
  agenda,
  events,
  language,
  memberNames,
}: {
  readonly agenda: CallAgenda | null;
  readonly events: readonly CallEvent[];
  readonly language: Language;
  readonly memberNames: ReadonlyMap<string, string>;
}): CallDecisions => {
  const formatNames = (ids: readonly string[]): string =>
    ids.map((id) => memberNames.get(id) ?? id).join(', ');

  const workTaskDrafts = getIncomingWorkTaskDrafts(events);
  const followUpDrafts = getIncomingFollowUpDrafts(events);
  const patches = getIncomingPatches(events);
  const latestInfoDrafts = getIncomingLatestInfoDrafts(events);

  const workTaskLines = workTaskDrafts.map((draft) =>
    language === 'ja'
      ? `- 作業タスク作成: ${draft.title}(担当: ${formatNames(draft.assigneeSlackUserIds)})`
      : `- Work task created: ${draft.title} (assignee: ${formatNames(draft.assigneeSlackUserIds)})`
  );

  const followUpLines = followUpDrafts.map((draft) =>
    language === 'ja'
      ? `- フォローアップ作成: ${draft.title} — ${draft.followUpQuestion}(宛先: ${formatNames(draft.assigneeSlackUserIds ?? [])})`
      : `- Follow-up created: ${draft.title} — ${draft.followUpQuestion} (to: ${formatNames(draft.assigneeSlackUserIds ?? [])})`
  );

  const patchLines = patches.map((patch) => {
    const title = patch.after.title ?? patch.before?.title ?? patch.taskId;
    const changed = Object.keys(patch.after).filter((key) => key !== 'kind');
    const base =
      language === 'ja'
        ? `- タスク変更: ${title}(${changed.join(', ')})`
        : `- Task updated: ${title} (${changed.join(', ')})`;

    if (patch.reason === undefined) {
      return base;
    }

    return language === 'ja'
      ? `${base} — 理由: ${patch.reason}`
      : `${base} — reason: ${patch.reason}`;
  });

  const latestInfoLines = latestInfoDrafts.map((draft) =>
    language === 'ja'
      ? `- 最新情報更新: #${draft.channelName}`
      : `- Latest info updated: #${draft.channelName}`
  );

  const lines = [
    ...workTaskLines,
    ...followUpLines,
    ...patchLines,
    ...latestInfoLines,
  ];

  const outcomeTags = [
    ...(workTaskDrafts.length + followUpDrafts.length > 0
      ? ['task-created']
      : []),
    ...(patches.length > 0 ? ['task-updated'] : []),
    ...(latestInfoDrafts.length > 0 ? ['latest-info-updated'] : []),
  ];

  const channelNames = [
    ...new Set([
      ...(agenda?.channels ?? []).map((channel) => channel.name),
      ...latestInfoDrafts.map((draft) => draft.channelName),
    ]),
  ];

  return { channelNames, lines, outcomeTags };
};
