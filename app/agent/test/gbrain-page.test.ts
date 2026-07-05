import { buildCallPage, buildEntityPages } from '#agent/gbrain/page';
import type { CallAgenda, CallEvent, CallSession } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const WORKSPACE_ID = 'workspace_1';
const SESSION_ID = 'session_abc';

const session: CallSession = {
  createdAt: '2026-06-15T00:59:00.000Z',
  endedAt: '2026-06-15T01:05:00.000Z',
  id: SESSION_ID,
  liveKitRoomName: 'exe-prod-room',
  purpose: 'manual_review',
  startedAt: '2026-06-15T01:00:00.000Z',
  status: 'ended',
  updatedAt: '2026-06-15T01:05:00.000Z',
  userId: 'user_1',
  workspaceId: WORKSPACE_ID,
};

const event = ({
  createdAt,
  payload,
  type,
}: {
  readonly createdAt: string;
  readonly payload: CallEvent['payload'];
  readonly type: CallEvent['type'];
}): CallEvent => ({
  callSessionId: SESSION_ID,
  createdAt,
  id: `${type}-${createdAt}`,
  payload,
  type,
  workspaceId: WORKSPACE_ID,
});

const emptyDecisions = {
  channelNames: [],
  lines: [],
  outcomeTags: [],
} as const;

const speakerAgenda: CallAgenda = {
  channelOpenWorkTasks: [],
  channelReviews: [],
  channels: [],
  followUpTasks: [],
  language: 'ja',
  now: '2026-06-15T01:00:00.000Z',
  purpose: 'manual_review',
  requestedWorkTasks: [],
  slackUserId: 'U_SPEAKER',
  speakerName: '石川さん',
  timezone: 'Asia/Tokyo',
  workTasks: [],
};

const events: readonly CallEvent[] = [
  event({
    createdAt: '2026-06-15T01:00:10.000Z',
    payload: { text: 'おはようございます' },
    type: 'transcript',
  }),
  event({
    createdAt: '2026-06-15T01:00:12.000Z',
    payload: { text: 'おはようございます、始めましょう' },
    type: 'agent_message',
  }),
  event({
    createdAt: '2026-06-15T01:05:00.000Z',
    payload: { summary: '通話が終了しました。' },
    type: 'summary',
  }),
];

void test('buildCallPage derives a deterministic slug from the session id', () => {
  const page = buildCallPage({
    agenda: null,
    composed: null,
    decisions: emptyDecisions,
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.equal(page.slug, `meetings/call-${SESSION_ID}`);
});

void test('buildCallPage renders diarized transcript with speaker and time', () => {
  const page = buildCallPage({
    agenda: null,
    composed: null,
    decisions: emptyDecisions,
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.match(page.markdown, /^type: meeting$/mu);
  // No agenda means no resolved participant, so the participant frontmatter is
  // omitted while the raw user id is still recorded.
  assert.doesNotMatch(page.markdown, /^participant:/mu);
  assert.match(page.markdown, /user_id: "user_1"/u);
  // Times are rendered in the default JST timezone (10:00:10 -> 10:00:10 local).
  assert.match(
    page.markdown,
    /- \*\*ユーザー\*\* \(10:00:10\): おはようございます/u
  );
  assert.match(
    page.markdown,
    /- \*\*Exe\*\* \(10:00:12\): おはようございます、始めましょう/u
  );
  assert.match(page.markdown, /## サマリ\n通話が終了しました。/u);
  // The summary event itself must not appear as a transcript line.
  assert.doesNotMatch(page.markdown, /\*\*Exe\*\* \(10:05:00\)/u);
});

void test('buildCallPage prefers the agenda speaker name for the participant', () => {
  const page = buildCallPage({
    agenda: speakerAgenda,
    composed: null,
    decisions: emptyDecisions,
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.match(page.markdown, /participant: "石川さん"/u);
  assert.match(page.markdown, /slack_user_id: "U_SPEAKER"/u);
  assert.match(page.markdown, /- \*\*石川さん\*\* \(10:00:10\)/u);
});

void test('buildCallPage lets the composed summary drive the title', () => {
  const page = buildCallPage({
    agenda: null,
    composed: { summary: '要約文。', title: '#dev-exe のタスク期限を外す相談' },
    decisions: emptyDecisions,
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.ok(
    page.markdown.includes('title: "#dev-exe のタスク期限を外す相談"'),
    'frontmatter title uses the composed title'
  );
  assert.ok(
    page.markdown.includes('# #dev-exe のタスク期限を外す相談'),
    'H1 uses the composed title'
  );
  assert.match(page.markdown, /## サマリ\n要約文。/u);
});

void test('buildCallPage renders tags, decisions, and wikilinks', () => {
  const page = buildCallPage({
    agenda: speakerAgenda,
    composed: null,
    decisions: {
      channelNames: ['dev-exe'],
      lines: ['- 作業タスク作成: レビュー基盤の刷新(担当: 山田)'],
      outcomeTags: ['task-created'],
    },
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.ok(
    page.markdown.includes(
      'tags: ["exe-call", "manual-review", "石川さん", "dev-exe", "task-created"]'
    ),
    'frontmatter carries the composed tag list'
  );
  assert.match(page.markdown, /## 決定事項/u);
  assert.ok(
    page.markdown.includes('- 作業タスク作成: レビュー基盤の刷新(担当: 山田)'),
    'decisions section carries the decision line'
  );
  assert.ok(
    page.markdown.includes('[[wiki/people/u_speaker]]'),
    'links line carries the participant wikilink keyed by slack user id'
  );
  assert.ok(
    page.markdown.includes('[[wiki/channels/dev-exe]]'),
    'links line carries the channel wikilink'
  );
});

void test('buildCallPage falls back to a deterministic title', () => {
  const page = buildCallPage({
    agenda: null,
    composed: null,
    decisions: emptyDecisions,
    events,
    language: 'ja',
    memberNames: new Map<string, string>(),
    session,
  });

  assert.match(page.markdown, /# 通話 2026-06-15 — 参加者/u);
  assert.doesNotMatch(page.markdown, /wiki\/people/u);
});

void test('buildEntityPages renders person and channel stubs', () => {
  const pages = buildEntityPages({
    agenda: speakerAgenda,
    decisions: { channelNames: ['dev-exe'], lines: [], outcomeTags: [] },
    language: 'ja',
    memberNames: new Map<string, string>(),
  });

  assert.deepEqual(
    pages.map((page) => page.slug),
    ['wiki/people/u_speaker', 'wiki/channels/dev-exe']
  );

  const person = pages.find((page) => page.slug === 'wiki/people/u_speaker');
  const channel = pages.find((page) => page.slug === 'wiki/channels/dev-exe');
  assert.ok(person !== undefined);
  assert.ok(channel !== undefined);
  assert.match(person.markdown, /^type: person$/mu);
  assert.ok(
    person.markdown.includes('title: "石川さん"'),
    'person stub carries the display title'
  );
  assert.match(channel.markdown, /^type: channel$/mu);
  assert.ok(
    channel.markdown.includes('title: "#dev-exe"'),
    'channel stub carries the hashtag title'
  );
});

void test('buildEntityPages skips person without agenda and non-ASCII channels', () => {
  const pages = buildEntityPages({
    agenda: null,
    decisions: { channelNames: ['開発チャンネル'], lines: [], outcomeTags: [] },
    language: 'ja',
    memberNames: new Map<string, string>(),
  });

  assert.equal(pages.length, 0);
});

void test('call page links line matches the entity page slugs', () => {
  const decisions = {
    channelNames: ['dev-exe'],
    lines: [],
    outcomeTags: [],
  } as const;
  const memberNames = new Map<string, string>();

  const page = buildCallPage({
    agenda: speakerAgenda,
    composed: null,
    decisions,
    events,
    language: 'ja',
    memberNames,
    session,
  });

  const entityPages = buildEntityPages({
    agenda: speakerAgenda,
    decisions,
    language: 'ja',
    memberNames,
  });

  assert.ok(entityPages.length > 0);
  entityPages.forEach((entityPage) => {
    assert.ok(
      page.markdown.includes(`[[${entityPage.slug}]]`),
      `links line carries [[${entityPage.slug}]]`
    );
  });
});
