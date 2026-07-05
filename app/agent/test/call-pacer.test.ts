import { buildPacerNote, createCallPacer } from '#agent/call-pacer';
import assert from 'node:assert/strict';
import { test } from 'node:test';

void test('first pacer note asks for a natural time check near the target', () => {
  const note = buildPacerNote({ noteIndex: 0, targetMinutes: 10 });

  assert.match(note, /internal note/);
  assert.match(note, /approaching its target length of about 10 minutes/);
  assert.match(note, /そろそろ10分になりますね/);
  assert.match(note, /Never read this note aloud/);
});

void test('later pacer notes push firmly toward closing with elapsed time', () => {
  const note = buildPacerNote({ noteIndex: 1, targetMinutes: 10 });

  assert.match(note, /roughly 20 minutes in/);
  assert.match(note, /end the call/);
  assert.doesNotMatch(note, /そろそろ/);
});

void test('pacer fires at first-note time and then every interval', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const injected: string[] = [];
  const pacer = createCallPacer({
    firstNoteMs: 570_000,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    intervalMs: 600_000,
    targetMinutes: 10,
  });

  pacer.start();
  pacer.start(); // Idempotent: a double start must not double the timers.
  t.mock.timers.tick(569_999);
  assert.equal(injected.length, 0);
  assert.equal(pacer.isOvertime(), false);
  t.mock.timers.tick(1);
  assert.equal(injected.length, 1);
  assert.match(injected[0] ?? '', /そろそろ10分/);
  assert.match(injected[0] ?? '', /STOP the deep-dive follow-up questions/);
  assert.equal(pacer.isOvertime(), true);
  t.mock.timers.tick(600_000);
  assert.equal(injected.length, 2);
  assert.match(injected[1] ?? '', /roughly 20 minutes in/);
  t.mock.timers.tick(600_000);
  assert.equal(injected.length, 3);
  assert.match(injected[2] ?? '', /roughly 30 minutes in/);

  pacer.dispose();
  t.mock.timers.tick(6_000_000);
  assert.equal(injected.length, 3);
});

void test('dispose before the first note cancels the pacer entirely', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const injected: string[] = [];
  const pacer = createCallPacer({
    firstNoteMs: 570_000,
    injectContext: (note): Promise<void> => {
      /* eslint-disable-next-line functional/immutable-data -- Test spy. */
      injected.push(note);

      return Promise.resolve();
    },
    intervalMs: 600_000,
    targetMinutes: 10,
  });

  pacer.start();
  pacer.dispose();
  t.mock.timers.tick(6_000_000);
  assert.equal(injected.length, 0);
});
