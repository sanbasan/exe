import { canTransitionCallStatus, callSessionSchema } from '@exe/domain';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const NOW = '2026-06-15T00:00:00.000Z';

void test('scheduled review sessions accept the optional run-tracking fields', () => {
  const session = callSessionSchema.parse({
    callScheduleId: 'schedule_1',
    createdAt: NOW,
    id: 'scheduled_call_workspace_1_user_1_schedule_1_run',
    liveKitRoomName: 'exe-room',
    purpose: 'scheduled_review',
    scheduledRunAt: NOW,
    status: 'created',
    updatedAt: NOW,
    userId: 'user_1',
    workspaceId: 'workspace_1',
  });

  assert.equal(session.callScheduleId, 'schedule_1');
  assert.equal(session.scheduledRunAt, NOW);
  assert.equal(session.status, 'created');
});

void test('a created run can be skipped before it starts ringing', () => {
  assert.equal(
    canTransitionCallStatus({ from: 'created', to: 'skipped' }),
    true
  );
  assert.equal(
    canTransitionCallStatus({ from: 'created', to: 'ringing' }),
    true
  );
});

void test('skip is a no-op repeat and is rejected once the call has started', () => {
  // Re-pressing skip on an already-skipped run keeps state intact.
  assert.equal(
    canTransitionCallStatus({ from: 'skipped', to: 'skipped' }),
    true
  );
  // After CallKit rings or the call is active/ended, skipping is not allowed.
  assert.equal(
    canTransitionCallStatus({ from: 'ringing', to: 'skipped' }),
    false
  );
  assert.equal(
    canTransitionCallStatus({ from: 'active', to: 'skipped' }),
    false
  );
  assert.equal(
    canTransitionCallStatus({ from: 'ended', to: 'skipped' }),
    false
  );
});

void test('a skipped run is terminal and cannot move elsewhere', () => {
  const targets = [
    'active',
    'created',
    'ended',
    'failed',
    'missed',
    'ringing',
  ] as const;

  targets.forEach((to) => {
    assert.equal(
      canTransitionCallStatus({ from: 'skipped', to }),
      false,
      `skipped should not transition to ${to}`
    );
  });
});

void test('existing ringing transitions are unchanged by the skip addition', () => {
  assert.equal(
    canTransitionCallStatus({ from: 'ringing', to: 'active' }),
    true
  );
  assert.equal(
    canTransitionCallStatus({ from: 'ringing', to: 'missed' }),
    true
  );
  assert.equal(canTransitionCallStatus({ from: 'active', to: 'ended' }), true);
});
