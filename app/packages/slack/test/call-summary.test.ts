import { buildCallSummaryBlocks, buildCallSummaryFallbackText } from '../src';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const contextTexts = (blocks: ReturnType<typeof buildCallSummaryBlocks>) =>
  blocks
    .filter((block) => block.type === 'context')
    .flatMap((block) => block.elements)
    .flatMap((element) => (element.type === 'mrkdwn' ? [element.text] : []));

test('call summary renders changed personal channel updates as context blocks', () => {
  const blocks = buildCallSummaryBlocks({
    language: 'ja',
    timezone: 'Asia/Tokyo',
    updates: [
      {
        channelId: 'C1',
        channelName: 'pj-example',
        nextCheckAt: '2026-07-02T00:00:00.000Z',
        statusText: '**進捗**\n\nER 図を共有済みです。',
      },
    ],
  });
  const texts = contextTexts(blocks);

  assert.equal(blocks[0]?.type, 'section');
  assert.match(texts[0] ?? '', /\*#pj-example\*/u);
  assert.match(
    texts[0] ?? '',
    /\*最新情報\*\n\*進捗\*\nER 図を共有済みです。/u
  );
  assert.match(texts[0] ?? '', /\*次回確認:\* 07\/02 \(木\) 09:00/u);
  assert.doesNotMatch(texts[0] ?? '', /<@/u);
  assert.doesNotMatch(texts[0] ?? '', /U[A-Z0-9]+/u);
});

test('call summary fallback notes when no channel updates changed', () => {
  const text = buildCallSummaryFallbackText({
    language: 'ja',
    updates: [],
  });

  assert.match(text, /変更されたチャンネルの最新情報はありません/u);
});

test('call summary renders the overview line under the heading', () => {
  const blocks = buildCallSummaryBlocks({
    language: 'ja',
    overview: 'pj-a、pj-b の振り返りをした定例会',
    timezone: 'Asia/Tokyo',
    updates: [],
  });

  assert.equal(blocks[1]?.type, 'section');
  assert.equal(
    blocks[1]?.type === 'section' ? blocks[1].text?.text : undefined,
    'pj-a、pj-b の振り返りをした定例会'
  );
  assert.match(
    contextTexts(blocks)[0] ?? '',
    /変更されたチャンネルの最新情報はありません/u
  );
});

test('call summary fallback carries the overview line', () => {
  const text = buildCallSummaryFallbackText({
    language: 'ja',
    overview: 'pj-example のタスクの日程を変更した',
    updates: [],
  });

  assert.match(text, /pj-example のタスクの日程を変更した/u);
});
