/* eslint-disable max-lines -- Prompt fixture tests keep related agenda and assertions together. */
import { buildOpeningMessage } from '#agent/opening-message';
import { buildSystemPrompt } from '#agent/system-prompt';
import { buildCallAgenda } from '@exe/domain';
import type {
  CallAgenda,
  Channel,
  ChannelReviewState,
  Task,
  WorkTask,
} from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-15T00:00:00.000Z';
const ASSIGNEE = 'U_ASSIGNEE';

const baseChannel = ({
  assigneeSlackUserIds,
  channelId,
  name,
}: {
  readonly assigneeSlackUserIds: readonly string[];
  readonly channelId: string;
  readonly name: string;
}): Channel => ({
  assigneeSlackUserIds: [...assigneeSlackUserIds],
  channelId,
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBySlackUserId: 'U_OWNER',
  name,
  status: 'active',
  updatedAt: '2026-06-01T00:00:00.000Z',
  watcherSlackUserIds: [],
  workspaceId: 'workspace_1',
});

const baseWorkTask = ({
  dueAt,
  id,
  title,
}: {
  readonly dueAt?: string;
  readonly id: string;
  readonly title: string;
}): WorkTask => ({
  assigneeSlackUserIds: [ASSIGNEE],
  completedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  ...(dueAt === undefined ? {} : { dueAt }),
  dependentTaskIds: [],
  dependsOnTaskIds: [],
  id,
  kind: 'work',
  requesterSlackUserIds: ['U_REQUESTER'],
  status: 'active',
  title,
  updatedAt: '2026-06-01T00:00:00.000Z',
  workspaceId: 'workspace_1',
});

const ownedChannelReviewState = ({
  nextCheckAt,
  nextCheckReason,
}: {
  readonly nextCheckAt: string;
  readonly nextCheckReason?: string;
}): ChannelReviewState => ({
  channelId: 'C_OWNED',
  createdAt: '2026-06-01T00:00:00.000Z',
  id: `C_OWNED:${ASSIGNEE}`,
  lastCheckedAt: '2026-06-10T00:00:00.000Z',
  nextCheckAt,
  ...(nextCheckReason === undefined ? {} : { nextCheckReason }),
  slackUserId: ASSIGNEE,
  updatedAt: '2026-06-10T00:00:00.000Z',
  workspaceId: 'workspace_1',
});

const buildAgenda = ({
  purpose,
  reviewStates,
}: {
  readonly purpose: CallAgenda['purpose'];
  readonly reviewStates?: readonly ChannelReviewState[];
}): CallAgenda => {
  const followUpTask: Task = {
    assigneeSlackUserIds: [ASSIGNEE],
    channelId: 'C_OWNED',
    completedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    followUpQuestion: 'Can we ship this week?',
    id: 'follow_up_1',
    kind: 'follow_up',
    requesterSlackUserIds: ['U_REQUESTER'],
    status: 'active',
    title: 'Confirm shipping date',
    updatedAt: '2026-06-01T00:00:00.000Z',
    workspaceId: 'workspace_1',
  };
  const tasks: readonly Task[] = [
    {
      ...baseWorkTask({
        dueAt: '2026-06-14T03:00:00.000Z',
        id: 'task_overdue',
        title: 'Overdue task',
      }),
      channelId: 'C_OWNED',
    },
    {
      ...baseWorkTask({
        dueAt: '2026-06-15T13:00:00.000Z',
        id: 'task_today',
        title: 'Due today task',
      }),
      channelId: 'C_OWNED',
    },
    {
      ...baseWorkTask({
        dueAt: '2026-06-16T03:00:00.000Z',
        id: 'task_tomorrow',
        title: 'Due tomorrow task',
      }),
      channelId: 'C_OWNED',
    },
    {
      ...baseWorkTask({
        dueAt: '2026-06-20T03:00:00.000Z',
        id: 'task_later',
        title: 'Later task',
      }),
      channelId: 'C_OWNED',
    },
    {
      ...baseWorkTask({
        id: 'task_requested',
        title: 'Requested task',
      }),
      assigneeSlackUserIds: ['U_OTHER'],
      channelId: 'C_OWNED',
      requesterSlackUserIds: [ASSIGNEE],
    },
    followUpTask,
  ];

  return buildCallAgenda({
    channels: [
      baseChannel({
        assigneeSlackUserIds: [ASSIGNEE],
        channelId: 'C_OWNED',
        name: 'owned-project',
      }),
      baseChannel({
        assigneeSlackUserIds: [],
        channelId: 'C_OTHER',
        name: 'other-project',
      }),
    ],
    language: 'ja',
    now: NOW,
    purpose,
    ...(reviewStates === undefined ? {} : { reviewStates }),
    slackUserId: ASSIGNEE,
    tasks,
    timezone: 'Asia/Tokyo',
  });
};

void test('manual opening starts the meeting without asking what the call is for', () => {
  const opening = buildOpeningMessage({
    language: 'ja',
    purpose: 'manual_review',
  });

  assert.match(opening, /ミーティングを始めます/);
  assert.doesNotMatch(opening, /接続しました/);
  assert.doesNotMatch(opening, /ご用件/);
  assert.doesNotMatch(opening, /か？/);
});

void test('scheduled opening starts the regular review without asking for a manual-call purpose', () => {
  const opening = buildOpeningMessage({
    language: 'ja',
    purpose: 'scheduled_review',
  });

  assert.match(opening, /定例を始めます/);
  assert.doesNotMatch(opening, /接続しました/);
});

void test('manual prompt starts the review directly and never asks what the call is for', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'manual_review' }),
  });

  assert.match(prompt, /manual, user-initiated call/);
  assert.match(prompt, /do NOT ask what the call is for/);
  assert.match(prompt, /specific errand/);
  assert.doesNotMatch(prompt, /定例と同じ感じ/);
});

void test('scheduled prompt runs the regular review flow directly', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /regular \(scheduled\) review/);
  assert.match(prompt, /The meeting is organized BY CHANNEL/);
  assert.doesNotMatch(prompt, /manual, user-initiated call/);
});

void test('prompt allows the current user to manage their own regular review schedule by dispatch', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(
    prompt,
    /say what you will check or change out loud, then trigger the assistant/
  );
  assert.match(prompt, /removing\/unregistering skipped dates/);
  assert.match(prompt, /does not require workspace admin permission/);
  assert.doesNotMatch(prompt, /get_my_call_schedule/);
});

void test('regular review flow covers task reminders, task changes, follow-ups, and per-project catch-up', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /締め切り当日/);
  assert.match(prompt, /締め切り前日/);
  assert.match(prompt, /期限超過/);
  assert.match(prompt, /no recital of title, value, and reason/);
  assert.match(prompt, /Follow-ups:/);
  assert.match(prompt, /one at a time/);
  assert.match(prompt, /Next check:/);
  assert.match(prompt, /wrap up the channel like a human chair/);
  assert.match(prompt, /NEVER narrate system state/);
  assert.doesNotMatch(prompt, /記録を頼んでおきます/);
  assert.match(prompt, /GBrainで検索します/);
});

void test('prompt exposes only the dispatch, status, and wait tools', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /run_assistant_task/);
  assert.match(prompt, /check_assistant_tasks/);
  assert.match(prompt, /wait_for_user/);
  assert.match(prompt, /NEVER tell the user you cannot do these/);
  assert.doesNotMatch(prompt, /propose_work_task/);
  assert.doesNotMatch(prompt, /record_channel_review/);
  assert.doesNotMatch(prompt, /compose_channel_latest_info/);
});

void test('prompt groups review by channel and separates other channels', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /# Your Channels/);
  assert.match(prompt, /1\. #owned-project \(channel ID: C_OWNED\)/);
  assert.match(prompt, /current state:/);
  assert.match(prompt, /requested tasks/);
  assert.match(prompt, /• Requested task — status:/);
  assert.match(prompt, /# Other Slack Channels/);
  assert.match(prompt, /1\. #other-project \(channel ID: C_OTHER\)/);
  assert.match(prompt, /trigger right away/);
  assert.match(prompt, /Do NOT ask "これでいい？" and wait before triggering/);
  assert.match(prompt, /8 or more days out/);
  assert.match(prompt, /the reason when it is 8\+ days out/);
});

void test('prompt hides task IDs and forbids IDs in request texts', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  // The voice prompt exposes NO internal IDs: task titles and due labels stay,
  // but task/block IDs are gone.
  assert.doesNotMatch(prompt, /task ID:/);
  assert.doesNotMatch(prompt, /block ID:/);
  assert.match(prompt, /Overdue task — [^\n]*\[期限超過\]/);
  assert.match(prompt, /Due today task — [^\n]*\[締め切り当日\]/);
  assert.match(prompt, /Later task —/);
  assert.match(prompt, /Confirm shipping date — Can we ship this week\?/);

  // The only ID it may pass is the channelId argument; everything else is by name.
  assert.match(prompt, /The ONLY ID you ever pass is the channelId ARGUMENT/);
  assert.match(prompt, /run_assistant_task carries NO text/);
  assert.match(prompt, /THE CONVERSATION IS THE INSTRUCTION/);
  assert.match(
    prompt,
    /Never read a channel ID, draft ID, or Slack user ID out loud/
  );
  // The old request-string authoring guidance is gone entirely.
  assert.doesNotMatch(prompt, /Request writing rules/);
  assert.doesNotMatch(
    prompt,
    /include a task ID from your lists to disambiguate/
  );
});

void test('prompt instructs the realtime model to use brief spoken tool preambles', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /short spoken preamble/);
  assert.match(prompt, /確認してみます/);
  assert.match(prompt, /少々お待ちください/);
  assert.match(
    prompt,
    /Do not use a preamble if you need to ask a clarification/
  );
});

void test('prompt requires a target person before recording a new follow-up task', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /the target person is required/);
  assert.match(prompt, /ask a short clarification before triggering/);
});

void test('prompt supports creating work tasks and looking up channel context', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /create a work task/);
  assert.match(prompt, /Create a new work task/);
  assert.match(prompt, /the assistant resolves the account itself/);
  assert.match(prompt, /the owner is required/);
});

void test('prompt tells the model timezone and allows date-only next checks', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /The workspace timezone is Asia\/Tokyo/);
  assert.match(prompt, /Interpret relative dates and date-only answers/);
  assert.match(prompt, /A date is enough/);
});

void test('prompt describes incoming changes instead of app approval', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /incoming-changes list/);
  assert.match(prompt, /automatically after the call/);
  assert.doesNotMatch(prompt, /confirm in the app UI/);
  assert.doesNotMatch(prompt, /ask the user to confirm in the app UI/);
});

void test('prompt frames latest info as a synthesized current state, not a changelog', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /# Latest info \(channel current state\)/);
  assert.match(prompt, /STANDING SUMMARY/);
  assert.match(prompt, /not a changelog entry/);
  assert.match(prompt, /workspace language/);
  assert.match(
    prompt,
    /points the user wants emphasized were said in the call/
  );
  assert.match(prompt, /background assistant composes/);
  assert.doesNotMatch(prompt, /update_channel_latest_info/);
  assert.match(prompt, /The self report is composed from the conversation/);
  assert.match(prompt, /NEVER record "no change", "変わりなし"/);
  assert.match(prompt, /Do NOT ask the user "what is this channel\?"/);
});

void test('prompt includes the speaker name and current time when available', () => {
  const agenda: CallAgenda = {
    ...buildAgenda({ purpose: 'scheduled_review' }),
    speakerName: 'Taro Yamada',
  };
  const prompt = buildSystemPrompt({ agenda });

  assert.match(prompt, /The person on this call is Taro Yamada\./);
  assert.match(prompt, new RegExp(`The current time is ${NOW}`));
});

void test('prompt lists workspace members and resolves IDs to names', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
    members: [
      { id: ASSIGNEE, profile: { display_name: '田中 太郎' } },
      { id: 'U_OTHER', real_name: 'Suzuki Jiro' },
    ],
  });

  assert.match(prompt, /# Workspace Members/);
  // The members section still lists the Slack user ID next to each name.
  assert.match(prompt, /- 田中 太郎 \(Slack user ID: U_ASSIGNEE\)/);
  // But task assignee/requester lists show plain names, with no ID in parens.
  assert.match(prompt, /assignees: 田中 太郎/);
  assert.doesNotMatch(prompt, /assignees: 田中 太郎 \(U_ASSIGNEE\)/);
  assert.match(prompt, /never read a Slack user ID out loud/);
});

void test('prompt exposes raw task fields including due date, status, and people', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /Requested task — status: active \| due: none/);
  assert.match(prompt, /due: 2026-06-14T03:00:00\.000Z \[期限超過\]/);
  assert.match(prompt, /acknowledge briefly and trigger right away/);
});

void test('a channel whose next-check date has not arrived is skipped from the review', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({
      purpose: 'scheduled_review',
      reviewStates: [
        ownedChannelReviewState({
          nextCheckAt: '2026-06-20T00:00:00.000Z',
          nextCheckReason: '来週まで動きがないため',
        }),
      ],
    }),
  });

  // The channel moves out of the numbered review list into the skipped section.
  assert.doesNotMatch(prompt, /1\. #owned-project/);
  assert.match(prompt, /# Skipped Channels/);
  assert.match(
    prompt,
    /- #owned-project \(channel ID: C_OWNED\) — next check planned: 2026-06-20T00:00:00\.000Z \(reason: 来週まで動きがないため\)/
  );
  assert.match(prompt, /No channel is due for review on this call/);
  assert.match(prompt, /EXCLUDED from today's review/);
});

void test('a next check today or in the past keeps the channel in the review', () => {
  // 2026-06-15T14:00Z is 23:00 the same day in Asia/Tokyo; 2026-06-10 is past.
  ['2026-06-15T14:00:00.000Z', '2026-06-10T00:00:00.000Z'].forEach(
    (nextCheckAt) => {
      const prompt = buildSystemPrompt({
        agenda: buildAgenda({
          purpose: 'scheduled_review',
          reviewStates: [ownedChannelReviewState({ nextCheckAt })],
        }),
      });

      assert.match(prompt, /1\. #owned-project \(channel ID: C_OWNED\)/);
      assert.doesNotMatch(prompt, /# Skipped Channels/);
    }
  );
});

void test('without review states the prompt reviews every owned channel and omits the skipped section', () => {
  const prompt = buildSystemPrompt({
    agenda: buildAgenda({ purpose: 'scheduled_review' }),
  });

  assert.match(prompt, /1\. #owned-project \(channel ID: C_OWNED\)/);
  assert.doesNotMatch(prompt, /# Skipped Channels/);
  assert.doesNotMatch(prompt, /Skipped Channels/);
});
