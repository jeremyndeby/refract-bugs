import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sanitizeBugDataset, validateBugDataset, validateBugEntry } from './bugs-validator.mjs';

const fixture = JSON.parse(await readFile(new URL('./bugs.fixture.json', import.meta.url), 'utf8'));

test('the public fixture satisfies the v6 terminal-attribution identity contract', () => {
  const result = validateBugDataset(fixture);
  assert.equal(result.blocked, false);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted.length, 20);
});

test('score and Roadmap-shaped reactions are required contract fields', () => {
  const missingScore = structuredClone(fixture.bugs[0]);
  delete missingScore.score;
  assert.match(validateBugEntry(missingScore).join(' '), /missing field: score/u);

  const invalidReaction = structuredClone(fixture.bugs[0]);
  invalidReaction.reactions = [{ emoji: '💜', count: 0 }];
  assert.match(validateBugEntry(invalidReaction).join(' '), /positive integer/u);
});

test('v6 requires the OP author key, per-comment author keys, reactions and closed dates', () => {
  const missingOp = structuredClone(fixture.bugs[0]);
  delete missingOp.author_key;
  assert.match(validateBugEntry(missingOp).join(' '), /missing field: author_key/u);

  const missingAuthor = structuredClone(fixture.bugs[0]);
  delete missingAuthor.comments[0].author_key;
  assert.match(validateBugEntry(missingAuthor).join(' '), /invalid shape/u);

  const missingCommentReactions = structuredClone(fixture.bugs[0]);
  delete missingCommentReactions.comments[0].reactions;
  assert.match(validateBugEntry(missingCommentReactions).join(' '), /invalid shape/u);

  const duplicate = structuredClone(fixture.bugs.find((bug) => bug.status === 'duplicate'));
  assert.ok(duplicate);
  assert.deepEqual(validateBugEntry(duplicate), []);
  duplicate.resolved_at = null;
  assert.match(validateBugEntry(duplicate).join(' '), /closed bugs must have/u);
});

test('the fixture marks OP replies by reusing the card author_key', () => {
  const entry = fixture.bugs[0];
  assert.ok(entry.comments.some((comment) =>
    !comment.is_team && comment.author_key === entry.author_key));
});

test('Dev and Mod names are public only on their respective TEAM roles', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.comments[0].team_name = 'Community Person';
  assert.match(validateBugEntry(entry).join(' '), /team_name is allowed only for Dev and Mod/u);
  delete entry.comments[0].team_name;

  const team = entry.comments.find((comment) => comment.is_team);
  team.team_role = 'mod';
  team.team_name = 'Eli';
  assert.deepEqual(validateBugEntry(entry), []);

  team.team_name = 'Eli | 💗';
  assert.match(validateBugEntry(entry).join(' '), /safe public text/u);

  delete team.team_name;
  assert.match(validateBugEntry(entry).join(' '), /team_name is required for Dev and Mod/u);

  const invalidStatus = structuredClone(fixture.bugs[0]);
  invalidStatus.status_tags = [{ tag: '⏳ Waiting' }];
  assert.match(validateBugEntry(invalidStatus).join(' '), /unsupported/u);
});

test('custom Roadmap emoji shape is accepted without adding a remote URL', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.reactions = [{ emoji: { name: 'octolove', id: '1528814869196050702' }, count: 1 }];
  assert.deepEqual(validateBugEntry(entry), []);
  assert.equal(JSON.stringify(entry).includes('http'), false);
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

test('terminal attribution names only safe Dev or Mod display text and may be absent after 45 days', () => {
  const fixed = structuredClone(fixture.bugs.find((bug) => bug.status === 'fixed'));
  fixed.terminal_attribution = { applied_by: 'Eli', applied_at: fixed.resolved_at };
  assert.deepEqual(validateBugEntry(fixed), []);

  fixed.terminal_attribution = null;
  assert.deepEqual(validateBugEntry(fixed), []);

  fixed.terminal_attribution = { applied_by: 'Eli | @private' };
  assert.match(validateBugEntry(fixed).join(' '), /safe Dev or Mod display name/u);
});

test('Inactive status and optional bulk_closed marker are accepted safely', () => {
  const inactive = structuredClone(fixture.bugs.find((bug) => bug.status === 'fixed'));
  inactive.status = 'inactive';
  inactive.bulk_closed = false;
  assert.deepEqual(validateBugEntry(inactive), []);
  inactive.bulk_closed = 'yes';
  assert.match(validateBugEntry(inactive).join(' '), /bulk_closed must be a boolean/u);
});

test('raw Discord custom emoji markup is rejected from public text', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.body = 'Thanks <:thank_you:1526362398884237332>';
  assert.match(validateBugEntry(entry).join(' '), /raw Discord custom emoji/u);
});

test('hotlinked images are rejected', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.images = [{ url: 'https://cdn.example.test/attachment.png' }];
  assert.match(validateBugEntry(entry).join(' '), /local repository URL/u);
});

test('one structured local image is allowed, with an optional local thumbnail', () => {
  const entry = structuredClone(fixture.bugs[0]);
  entry.images = [{ url: './assets/bugs/example.webp', thumb: './assets/bugs/example-thumb.webp' }];
  assert.deepEqual(validateBugEntry(entry), []);
  entry.images.push({ url: './assets/bugs/second.webp' });
  assert.match(validateBugEntry(entry).join(' '), /at most one/u);
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
