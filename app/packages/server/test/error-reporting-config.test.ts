import { serverConfig } from '#server/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Regression guard: tests exercise intentional failure paths (rejected jobs,
// thrown notifies), and reportServerError must never ship those to Sentry.
// The config boundary detects the Node test runner and blanks the DSN.
void test('sentryDsn is disabled while running under the test runner', () => {
  assert.equal(serverConfig.app.sentryDsn, undefined);
});
