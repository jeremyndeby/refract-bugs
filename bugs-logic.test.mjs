import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bugThreadUrl, datasetCounters, selectBugs } from './bugs-logic.mjs';

const fixture = JSON.parse(await readFile(new URL('./bugs.fixture.json', import.meta.url), 'utf8'));

test('Popularity, Trending and Date sorts use the public contract fields', () => {
  const common = { status: 'open', generatedAt: fixture.generated_at };
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'popularity' })[0].reactors_unique, 54);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'trending' })[0].activity_7d, 31);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'date' })[0].id, '1600000000000000001');
});

test('search covers bodies, tags and anonymized comment text', () => {
  const common = { status: 'open', generatedAt: fixture.generated_at };
  assert.equal(selectBugs(fixture.bugs, { ...common, query: 'safe-area' }).length, 1);
  assert.equal(selectBugs(fixture.bugs, { ...common, query: 'calendar' }).length, 1);
});

test('activity and tag filters compose', () => {
  const selected = selectBugs(fixture.bugs, {
    status: 'open', activity: 'with-images', tag: 'Android', generatedAt: fixture.generated_at,
  });
  assert.deepEqual(selected.map((bug) => bug.id), ['1600000000000000001', '1600000000000000005']);
});

test('fixed cards never receive a Discord thread link', () => {
  const open = fixture.bugs.find((bug) => bug.status === 'open');
  const fixed = fixture.bugs.find((bug) => bug.status === 'fixed');
  assert.match(bugThreadUrl(open, '1490347491151970366'), /discord\.com/u);
  assert.equal(bugThreadUrl(fixed, '1490347491151970366'), null);
});

test('header counters are derived from accepted entries', () => {
  assert.deepEqual(datasetCounters(fixture.bugs, fixture.generated_at), {
    open: 12,
    fixed: 8,
    opened24h: 1,
    opened7d: 5,
    fixed24h: 1,
    fixed7d: 4,
    openDelta24h: 0,
    openDelta7d: 1,
  });
});
