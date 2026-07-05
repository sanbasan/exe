import {
  formatPage,
  formatSearchResults,
} from '#agent/assistant/tools/gbrain-tools';
import assert from 'node:assert/strict';
import { test } from 'node:test';

void test('formatSearchResults returns the no-match message for empty results', () => {
  const output = formatSearchResults([]);

  assert.equal(output, 'No stored memory matched this query.');
});

void test('formatSearchResults truncates and flattens snippets', () => {
  const longChunk = 'a'.repeat(601);
  const output = formatSearchResults([
    { chunkText: longChunk, slug: 'meetings/one' },
    { chunkText: 'line one\nline two', slug: 'meetings/two' },
    { slug: 'meetings/three' },
  ]);

  assert.match(output, /- \[meetings\/one\] /u);
  // 600 chars + the ellipsis marker, and nothing beyond it on that line.
  assert.ok(output.includes(`- [meetings/one] ${'a'.repeat(600)}…`));
  assert.ok(!output.includes('a'.repeat(601)));
  // Newlines inside a snippet are collapsed to spaces.
  assert.ok(output.includes('- [meetings/two] line one line two'));
  assert.doesNotMatch(output.split('\n')[2] ?? '', /line one\nline two/u);
  // A result without a chunk renders as just its slug.
  assert.ok(output.includes('- [meetings/three]'));
  assert.ok(!output.includes('- [meetings/three] '));
});

void test('formatPage returns the full markdown when it fits', () => {
  const markdown =
    '# Session Title\n\nThe compiled body text.\n\nThe timeline.';
  const output = formatPage(markdown);

  assert.equal(output, markdown);
});

void test('formatPage truncates long pages with a truncation note', () => {
  const output = formatPage('b'.repeat(6100));

  assert.ok(output.endsWith('\n…(truncated)'));
  assert.ok(output.startsWith('b'.repeat(6000)));
  assert.ok(!output.includes('b'.repeat(6001)));
});

void test('formatPage reports when a page has no readable content', () => {
  const output = formatPage('   \n  ');

  assert.match(output, /no readable content/u);
});
