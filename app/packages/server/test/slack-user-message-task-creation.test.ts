import { parseSlackReplyMessage } from '../src/infrastructure/slack/slack-messages';
import type { SlackGateway, SlackMessage } from '../src/ports';
import type { SlackUserMessageInput } from '../src/services/slack-service';
import { getMessagesForTaskCreation } from '../src/services/slack-task-creation';
import { formatMessageForTaskExtraction } from '../src/services/slack-task-creation/format-message';
import {
  getSlackTaskCreationReplyThreadTs,
  getSlackTaskCreationSourceMessageTs,
  shouldHandleSlackTaskCreationTrigger,
} from '../src/services/slack-user-message';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const buildInput = (
  overrides: Partial<SlackUserMessageInput> = {}
): SlackUserMessageInput => ({
  channelId: 'C123',
  channelType: 'channel',
  messageTs: '1000.000200',
  slackTeamId: 'T123',
  slackUserId: 'U123',
  text: '<@UBOT>',
  type: 'app_mention',
  ...overrides,
});

test('channel app_mention triggers task creation at root and in threads', () => {
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({ params: buildInput() }),
    true
  );
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({ threadTs: '1000.000100' }),
    }),
    true
  );
});

test('ordinary channel messages do not trigger task creation', () => {
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({ text: 'task text', type: 'message' }),
    }),
    false
  );
});

test('DM root messages trigger task creation without a bot mention', () => {
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({
        channelId: 'D123',
        channelType: 'im',
        text: '契約書を確認する',
        type: 'message',
      }),
    }),
    true
  );
});

test('DM thread messages and DM app_mentions are ignored', () => {
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({
        channelId: 'D123',
        channelType: 'im',
        text: '<@UBOT> 契約書を確認する',
        threadTs: '1000.000100',
        type: 'message',
      }),
    }),
    false
  );
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({
        channelId: 'D123',
        channelType: 'im',
        text: '<@UBOT> 契約書を確認する',
        type: 'app_mention',
      }),
    }),
    false
  );
});

test('bot and subtype messages are ignored', () => {
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({ botId: 'B123' }),
    }),
    false
  );
  assert.equal(
    shouldHandleSlackTaskCreationTrigger({
      params: buildInput({ subtype: 'message_changed' }),
    }),
    false
  );
});

test('thread task creation replies to and de-duplicates by the thread root message', () => {
  assert.equal(
    getSlackTaskCreationReplyThreadTs({
      messageTs: '1000.000200',
      threadTs: '1000.000100',
    }),
    '1000.000100'
  );
  assert.equal(
    getSlackTaskCreationSourceMessageTs({
      messageTs: '1000.000200',
      threadTs: '1000.000100',
    }),
    '1000.000100'
  );
  assert.equal(
    getSlackTaskCreationReplyThreadTs({ messageTs: '1000.000200' }),
    '1000.000200'
  );
  assert.equal(
    getSlackTaskCreationSourceMessageTs({ messageTs: '1000.000200' }),
    '1000.000200'
  );
});

test('task creation uses the current message when not in a thread', async () => {
  let getRepliesCalled = false;
  const slackGateway = {
    getReplies: async (): Promise<readonly SlackMessage[]> => {
      getRepliesCalled = true;
      return [];
    },
  } as unknown as SlackGateway;

  const messages = await getMessagesForTaskCreation({
    botToken: 'test-bot-token',
    channelId: 'C123',
    messageTs: '1000.000200',
    slackGateway,
    slackUserId: 'U123',
    text: '<@UBOT>',
  });

  assert.equal(getRepliesCalled, false);
  assert.deepEqual(messages, [
    { text: '<@UBOT>', ts: '1000.000200', user: 'U123' },
  ]);
});

test('task creation preserves root message attachments when not in a thread', async () => {
  const slackGateway = {
    getReplies: async (): Promise<readonly SlackMessage[]> => [],
  } as unknown as SlackGateway;

  const messages = await getMessagesForTaskCreation({
    botToken: 'test-bot-token',
    channelId: 'C123',
    files: [{ name: 'mita-app-revisions.pdf', title: 'ignored title' }],
    messageTs: '1000.000200',
    slackGateway,
    slackUserId: 'U123',
    text: '<@UBOT> Revisions made, please review',
  });

  assert.deepEqual(messages, [
    {
      files: [{ name: 'mita-app-revisions.pdf', title: 'ignored title' }],
      text: '<@UBOT> Revisions made, please review',
      ts: '1000.000200',
      user: 'U123',
    },
  ]);
});

test('thread task creation fetches messages through the trigger message and reverses Slack replies like topaz', async () => {
  const calls: unknown[] = [];
  const slackGateway = {
    getReplies: async (params: unknown): Promise<readonly SlackMessage[]> => {
      calls.push(params);
      return [
        {
          files: [{ name: 'root-spec.pdf' }],
          text: 'root task content',
          ts: '1000.000100',
          user: 'U111',
        },
        {
          files: [{ title: 'reply-context.pdf' }],
          text: '<@UBOT>',
          ts: '1000.000200',
          user: 'U123',
        },
      ];
    },
  } as unknown as SlackGateway;

  const messages = await getMessagesForTaskCreation({
    botToken: 'test-bot-token',
    channelId: 'C123',
    messageTs: '1000.000200',
    slackGateway,
    slackUserId: 'U123',
    text: '<@UBOT>',
    threadTs: '1000.000100',
  });

  assert.deepEqual(calls, [
    {
      botToken: 'test-bot-token',
      channelId: 'C123',
      inclusive: true,
      latest: '1000.000200',
      limit: 100,
      threadTs: '1000.000100',
    },
  ]);
  assert.deepEqual(messages, [
    {
      files: [{ title: 'reply-context.pdf' }],
      text: '<@UBOT>',
      ts: '1000.000200',
      user: 'U123',
    },
    {
      files: [{ name: 'root-spec.pdf' }],
      text: 'root task content',
      ts: '1000.000100',
      user: 'U111',
    },
  ]);
});

test('Slack reply parser preserves attachment names and titles', () => {
  assert.deepEqual(
    parseSlackReplyMessage({
      files: [
        { name: 'root-spec.pdf', title: 'Root Spec' },
        { title: 'reply-context.pdf' },
        { name: '' },
        { name: 123 },
      ],
      text: 'root task content',
      ts: '1000.000100',
      user: 'U111',
    }),
    {
      files: [
        { name: 'root-spec.pdf', title: 'Root Spec' },
        { title: 'reply-context.pdf' },
      ],
      text: 'root task content',
      ts: '1000.000100',
      user: 'U111',
    }
  );
});

test('task extraction formatter includes attachment count and file names', () => {
  const formatted = formatMessageForTaskExtraction({
    language: 'ja',
    members: [{ realName: '山田太郎', slackUserId: 'U123' }],
    message: {
      files: [
        { name: '三田会アプリ修正.pdf', title: 'ignored title' },
        { title: '画面一覧.png' },
        { name: '確認事項.txt' },
      ],
      text: 'Revisions made, please review',
      ts: '1000.000200',
      user: 'U123',
    },
    timezone: 'Asia/Tokyo',
  });

  assert.equal(
    formatted,
    '[1970/1/1 9:16:40] 山田太郎: Revisions made, please review\nAttachments: 3 files: 三田会アプリ修正.pdf, 画面一覧.png, 確認事項.txt'
  );
});

test('task extraction formatter output is unchanged without attachments', () => {
  const formatted = formatMessageForTaskExtraction({
    language: 'ja',
    members: [{ realName: '山田太郎', slackUserId: 'U123' }],
    message: {
      text: '契約書を確認する',
      ts: '1000.000200',
      user: 'U123',
    },
    timezone: 'Asia/Tokyo',
  });

  assert.equal(formatted, '[1970/1/1 9:16:40] 山田太郎: 契約書を確認する');
});
