import {
  setDocument,
  updateDocument,
} from '../src/infrastructure/firestore/repository-utils';
import type { Firestore } from 'firebase-admin/firestore';
import assert from 'node:assert/strict';
import { test } from 'node:test';

interface RecordedSet {
  readonly options: unknown;
  readonly path: string;
  readonly value: unknown;
}

const createRecordingFirestore = (): {
  readonly firestore: Firestore;
  readonly sets: readonly RecordedSet[];
} => {
  const sets: RecordedSet[] = [];

  const firestore = {
    doc: (path: string) => ({
      set: async (value: unknown, options?: unknown): Promise<void> => {
        sets.push({ options, path, value });
      },
    }),
  } as unknown as Firestore;

  return { firestore, sets };
};

void test('updateDocument does a full replace without a merge option', async () => {
  const { firestore, sets } = createRecordingFirestore();
  const value = { id: 'task-1', title: 'Submit report' };

  await updateDocument({ firestore, path: 'tasks/task-1', value });

  assert.equal(sets.length, 1);
  assert.equal(sets[0].path, 'tasks/task-1');
  assert.equal(sets[0].value, value);
  // No merge option: omitting an optional key must delete the stored field.
  assert.equal(sets[0].options, undefined);
});

void test('setDocument writes with a merge option', async () => {
  const { firestore, sets } = createRecordingFirestore();
  const value = { id: 'task-1', title: 'Submit report' };

  await setDocument({ firestore, path: 'tasks/task-1', value });

  assert.equal(sets.length, 1);
  assert.equal(sets[0].path, 'tasks/task-1');
  assert.equal(sets[0].value, value);
  assert.deepEqual(sets[0].options, { merge: true });
});
