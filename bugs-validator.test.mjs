import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sanitizeBugDataset, validateBugDataset, validateBugEntry } from './bugs-validator.mjs';

const fixture = JSON.parse(await readFile(new URL('./bugs.fixture.json', import.meta.url), 'utf8'));

test('the public fixture satisfies the frozen contract', () => {
  const result = validateBugDataset(fixture);
  assert.equal(result.blocked, false);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted.length, 20);
});

test('an email rejects only its entry below the publication threshold', () => {
  const bugs = structuredClone(fixture.bugs);
  bugs.push({ ...structuredClone(bugs[0]), id: '1600000000000000099', body: 'Reply to person@example.test' });
  const result = validateBugDataset({ ...fixture, bugs });
  assert.equal(result.rejected.length, 1);
  assert.equal(result.accepted.length, 20);
  assert.equal(result.blocked, false);
  assert.match(result.rejected[0].errors.join(' '), /forbidden email/u);
});

test('the producer-facing sanitizer removes rejected entries from serialized data', () => {
  const bugs = structuredClone(fixture.bugs);
  bugs.push({
    ...structuredClone(bugs[0]),
    id: '1600000000000000098',
    body: `Reply to person${'@'}example.test`,
  });
  const sanitized = sanitizeBugDataset({ ...fixture, bugs });
  assert.equal(sanitized.report.blocked, false);
  assert.equal(sanitized.report.rejected.length, 1);
  assert.equal(sanitized.data.bugs.length, 20);
  assert.equal(JSON.stringify(sanitized.data).includes('example.test'), false);
});

test('a token-like value is rejected', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.comments[0].text = 'authorization=abcdefghijklmnop';
  assert.match(validateBugEntry(entry).join(' '), /forbidden token/u);
});

test('hotlinked images are rejected', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.images = ['https://cdn.example.test/attachment.png'];
  assert.match(validateBugEntry(entry).join(' '), /local repository URLs/u);
});

test('more than five percent rejected blocks publication', () => {
  const bugs = structuredClone(fixture.bugs);
  bugs[0].body = 'token=abcdefghijklmnop';
  bugs[1].body = 'token=qrstuvwxyzabcdef';
  const result = validateBugDataset({ ...fixture, bugs });
  assert.equal(result.rejected.length, 2);
  assert.equal(result.blocked, true);
});

test('more than twenty rejected entries blocks publication', () => {
  const bugs = Array.from({ length: 421 }, (_, index) => ({
    ...structuredClone(fixture.bugs[0]),
    id: String(1700000000000000000n + BigInt(index)),
  }));
  for (let index = 0; index < 21; index += 1) bugs[index].body = 'password=abcdefghijklmnop';
  const result = validateBugDataset({ ...fixture, bugs });
  assert.equal(result.rejected.length, 21);
  assert.equal(result.rejectedRatio <= 0.05, true);
  assert.equal(result.blocked, true);
});
