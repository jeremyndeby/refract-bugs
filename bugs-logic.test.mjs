import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { agePillColor, bugThreadUrl, datasetCounters, daysBetween, nextSortState, reactionPillDisplay, selectBugs, teamParticipation } from './bugs-logic.mjs';

const fixture = JSON.parse(await readFile(new URL('./bugs.fixture.json', import.meta.url), 'utf8'));

test('Popularity, Trending and Date sorts use the public contract fields', () => {
  const common = { status: 'open', generatedAt: fixture.generated_at };
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'popularity' })[0].score, 69.42);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'trending' })[0].activity_7d, 31);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'date' })[0].id, '1600000000000000001');
});

test('Popularity, Trending and Date sorts reverse in ascending mode', () => {
  const common = { status: 'open', direction: 'asc', generatedAt: fixture.generated_at };
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'popularity' })[0].score, 3.91);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'trending' })[0].activity_7d, 0);
  assert.equal(selectBugs(fixture.bugs, { ...common, sort: 'date' })[0].id, '1600000000000000012');
});

test('Popularity consumes the exported score rather than recomputing from reactor counts', () => {
  const items = structuredClone(fixture.bugs.slice(0, 2));
  items[0].reactors_unique = 1;
  items[0].score = 100;
  items[1].reactors_unique = 999;
  items[1].score = 10;
  assert.equal(selectBugs(items, { status: 'open', sort: 'popularity' })[0].id, items[0].id);
});

test('reaction pills mirror Roadmap semantics and collapse after three values', () => {
  const display = reactionPillDisplay({ reactions: [
    { emoji: '💜', count: 12 },
    { emoji: '👍', count: 4 },
    { emoji: '👎', count: 2, negative: true },
    { emoji: '🔥', count: 1 },
  ] });
  assert.deepEqual(display.visible.map(({ semantic }) => semantic), ['primary', 'positive', 'negative']);
  assert.equal(display.hiddenCount, 1);
});

test('TEAM participation groups Dev names and aggregates anonymous Mods', () => {
  assert.deepEqual(teamParticipation([
    { is_team: true, team_role: 'dev', team_name: 'Boulet' },
    { is_team: true, team_role: 'mod' },
    { is_team: false },
    { is_team: true, team_role: 'dev', team_name: 'Boulet' },
    { is_team: true, team_role: 'dev', team_name: 'Exooo' },
    { is_team: true, team_role: 'mod' },
  ]), [
    { kind: 'dev', name: 'Boulet', count: 2 },
    { kind: 'dev', name: 'Exooo', count: 1 },
    { kind: 'mod', name: 'MOD', count: 2 },
  ]);
});

test('clicking the active sort reverses it while a new sort starts descending', () => {
  assert.deepEqual(nextSortState('popularity', 'desc', 'popularity'), { sort: 'popularity', direction: 'asc' });
  assert.deepEqual(nextSortState('popularity', 'asc', 'popularity'), { sort: 'popularity', direction: 'desc' });
  assert.deepEqual(nextSortState('popularity', 'asc', 'date'), { sort: 'date', direction: 'desc' });
});

test('search covers titles, descriptions and tags with token prefixes and typo distance', () => {
  const common = { status: 'open', generatedAt: fixture.generated_at };
  assert.equal(selectBugs(fixture.bugs, { ...common, query: 'previous progress' }).length, 1);
  assert.equal(selectBugs(fixture.bugs, { ...common, query: 'track' }).length > 0, true);
  const exactCase = [{
    ...fixture.bugs[0], title: 'Bug in Importing ratings', body: 'Import fails.', tags: ['Import'],
  }];
  assert.equal(selectBugs(exactCase, { ...common, query: 'important rating' }).length, 1);
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
  assert.equal(bugThreadUrl(fixture.bugs.find((bug) => bug.status === 'duplicate'), '1490347491151970366'), null);
  assert.equal(bugThreadUrl(fixture.bugs.find((bug) => bug.status === 'off_topic'), '1490347491151970366'), null);
});

test('header counters are derived from accepted entries', () => {
  assert.deepEqual(datasetCounters(fixture.bugs, fixture.generated_at), {
    open: 12,
    fixed: 6,
    duplicate: 1,
    offTopic: 1,
    closed: 8,
    opened24h: 1,
    opened7d: 5,
    fixed24h: 1,
    fixed7d: 4,
    openDelta24h: 0,
    openDelta7d: 1,
    avgFixDays: 13.666666666666666,
    medianFixDays: 14.5,
  });
});

test('age color is continuous and resolution days derive from public dates', () => {
  assert.notEqual(agePillColor(30), agePillColor(31));
  assert.match(agePillColor(100), /^hsl\(0/u);
  assert.equal(daysBetween('2026-08-01T00:00:00.000Z', '2026-08-13T00:00:00.000Z'), 12);
});

test('Closed contains Fixed, Duplicate and Off-topic and can filter Fixed by terminal tag', () => {
  assert.equal(selectBugs(fixture.bugs, { status: 'closed' }).length, 8);
  assert.equal(selectBugs(fixture.bugs, { status: 'closed', tag: 'Fixed' }).length, 6);
});
