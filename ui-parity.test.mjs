import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

test('Open cards use the Roadmap edge-badge geometry', () => {
  assert.match(styles, /\.rank-badge, \.edge-badge \{[\s\S]*?top: -12px;[\s\S]*?left: 14px;[\s\S]*?min-height: 24px;[\s\S]*?padding: 3px 9px;/u);
  assert.match(styles, /\.edge-badge \{ right: 14px; left: auto; \}/u);
  assert.match(styles, /\.rank-badge, \.edge-badge \{ top: -10px; min-height: 21px; padding: 3px 7px; font-size: 9px; \}/u);
  assert.match(styles, /\.rank-badge \{ left: 10px; \}/u);
  assert.match(styles, /\.edge-badge \{ right: 10px; left: auto; \}/u);
  assert.match(styles, /\.bug-card \{[\s\S]*?overflow: visible;/u);
});

test('Open cards place rank left and status then age right', () => {
  assert.match(app, /card\.append\(createRankBadge\(rank\), createOpenEdgeBadge\(bug\)\)/u);
  const edgeBadge = app.slice(app.indexOf('function createOpenEdgeBadge'), app.indexOf('function createCard'));
  assert.ok(edgeBadge.indexOf("'status-badge-label bug-status-badge-label'") < edgeBadge.indexOf("'eta-badge bug-age-badge'"));
  assert.doesNotMatch(app, /'rank-pill'/u);
  assert.doesNotMatch(app, /'age-pill'/u);
});

test('mobile edge badges reserve room for the rank badge', () => {
  assert.match(styles, /\.bug-edge-badge \{ max-width: calc\(100% - 70px\); \}/u);
  assert.match(styles, /\.bug-status-badge-label \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/u);
});

test('cards expose Dev and Mod participation before discussion expansion', () => {
  assert.match(app, /createTeamParticipationRow\(bug\)/u);
  assert.match(app, /teamRole === 'mod' \? 'TEAM MOD' : 'TEAM'/u);
  assert.match(app, /team-participation-pill/u);
  assert.match(styles, /\.team-participation-row \{[\s\S]*?flex-wrap: wrap;/u);
});
