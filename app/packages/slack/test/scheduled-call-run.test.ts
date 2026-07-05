import {
  buildScheduledCallRunActionsBlockId,
  buildScheduledCallRunBlocks,
  buildScheduledCallRunStatusText,
  getScheduledCallRunReschedulePresetMinutes,
  isScheduledCallRunReschedulePreset,
  listScheduledCallRunReschedulePresets,
  parseScheduledCallRunReferenceFromBlockId,
  parseScheduledCallRunRescheduleSubmission,
  scheduledCallRunReschedulePresets,
  slackActionIds,
} from '../src';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const REFERENCE = 'encoded.payload-with-dot.and-signature';

test('reschedule presets cover 30/60/90/120 minutes in order', () => {
  const presets = listScheduledCallRunReschedulePresets();

  assert.deepEqual(
    presets.map(getScheduledCallRunReschedulePresetMinutes),
    [30, 60, 90, 120]
  );
});

test('preset guard accepts known values and rejects others', () => {
  assert.equal(
    isScheduledCallRunReschedulePreset(
      scheduledCallRunReschedulePresets.inThirtyMinutes
    ),
    true
  );
  assert.equal(isScheduledCallRunReschedulePreset('nope'), false);
});

test('actions block id round-trips the signed reference', () => {
  const blockId = buildScheduledCallRunActionsBlockId(REFERENCE);

  assert.equal(parseScheduledCallRunReferenceFromBlockId(blockId), REFERENCE);
  assert.equal(parseScheduledCallRunReferenceFromBlockId('other'), null);
});

test('DM blocks expose join, reschedule select, pick-time, and skip', () => {
  const blocks = buildScheduledCallRunBlocks({
    joinUrl: 'https://example.com/call',
    language: 'ja',
    message: 'time for your call',
    reference: REFERENCE,
  });

  const actions = blocks.find((block) => block.type === 'actions');
  assert.ok(actions && actions.type === 'actions');
  assert.equal(
    actions.block_id,
    buildScheduledCallRunActionsBlockId(REFERENCE)
  );

  const actionIds = actions.elements.map((element) =>
    'action_id' in element ? element.action_id : undefined
  );
  assert.deepEqual(actionIds, [
    slackActionIds.openExeApp,
    slackActionIds.rescheduleScheduledCallRun,
    slackActionIds.openScheduledCallRunReschedule,
    slackActionIds.skipScheduledCallRun,
  ]);

  const select = actions.elements.find(
    (element) => element.type === 'static_select'
  );
  assert.ok(select && select.type === 'static_select');
  assert.equal(select.options?.length, 4);

  const skip = actions.elements.find(
    (element) =>
      'action_id' in element &&
      element.action_id === slackActionIds.skipScheduledCallRun
  );
  assert.ok(skip && skip.type === 'button');
  assert.equal(skip.value, REFERENCE);
});

test('status text differs per kind and language', () => {
  assert.match(
    buildScheduledCallRunStatusText({ kind: 'skipped', language: 'ja' }),
    /スキップ/u
  );
  assert.match(
    buildScheduledCallRunStatusText({
      kind: 'rescheduled',
      language: 'en',
      time: 'Jun 29 (Mon) 10:30 AM',
    }),
    /Jun 29/u
  );
});

test('modal submission parser reads selected date and time', () => {
  const parsed = parseScheduledCallRunRescheduleSubmission({
    'exe.scheduled_call_run.reschedule_date': {
      'exe.scheduled_call_run.reschedule_date': {
        selected_date: '2026-06-29',
      },
    },
    'exe.scheduled_call_run.reschedule_time': {
      'exe.scheduled_call_run.reschedule_time': {
        selected_time: '10:30',
      },
    },
  });

  assert.deepEqual(parsed, { date: '2026-06-29', time: '10:30' });
  assert.equal(parseScheduledCallRunRescheduleSubmission({}), null);
});
