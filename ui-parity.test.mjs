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
  assert.match(app, /teamRole === 'mod' \? 'MOD' : 'TEAM'/u);
  assert.match(app, /teamRole === 'mod' \? 'mod-name' : 'dev-name'/u);
  assert.match(app, /team-participation-pill/u);
  assert.match(styles, /\.team-participation-row \{[\s\S]*?flex-wrap: wrap;/u);
  assert.match(styles, /\.mod-comment \{[\s\S]*?var\(--mod-pink\)/u);
  assert.match(styles, /\.mod-name \{ color: var\(--mod-pink\); \}/u);
  assert.match(styles, /\.mod-participation-pill \{[\s\S]*?--participant-color: var\(--mod-pink\);/u);
});

test('comment participation, total, and expansion controls share the card footer', () => {
  const card = app.slice(app.indexOf('function createCard'), app.indexOf('function selectedBugs'));
  assert.ok(card.indexOf("const teamParticipationRow = createTeamParticipationRow(bug)") > card.indexOf("const discussionActions"));
  assert.ok(card.indexOf('discussionActions.append(teamParticipationRow)') < card.indexOf('discussionActions.append(commentTotal, commentToggle)'));
  assert.match(card, /commentTotal\.append\([\s\S]*?'comment-bubble'[\s\S]*?'comment-count'/u);
  assert.doesNotMatch(card, /commentTotal\.append\([\s\S]*?'comment-arrow'/u);
  assert.match(card, /commentToggle\.append\(el\('span', 'comment-arrow', '⌄'\)\)/u);
  assert.match(styles, /\.discussion-actions \{[\s\S]*?justify-content: flex-end;/u);
});

test('expanded discussions repeat team participation above comments', () => {
  const comments = app.slice(app.indexOf('function createComments'), app.indexOf('function openLightbox'));
  assert.ok(comments.indexOf('section.append(participation)') < comments.indexOf("const list = el('ol', 'comment-list')"));
});

test('Open titles link to Discord while Closed titles stay plain text', () => {
  const card = app.slice(app.indexOf('function createCard'), app.indexOf('function selectedBugs'));
  assert.match(card, /if \(bug\.status === 'open'\) \{[\s\S]*?titleLink\.href = bugThreadUrl\(bug, DISCORD_GUILD_ID\);[\s\S]*?title\.append\(titleLink\);[\s\S]*?\} else \{[\s\S]*?title\.textContent = bug\.title;/u);
  assert.match(card, /titleLink\.target = '_blank'/u);
  assert.match(styles, /\.bug-summary \{[\s\S]*?cursor: default;/u);
});

test('Read more toggles only description text and stops discussion propagation', () => {
  const card = app.slice(app.indexOf('function createCard'), app.indexOf('function selectedBugs'));
  assert.match(card, /descriptionToggle\.addEventListener\('click', \(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?setDescriptionExpanded/u);
  assert.match(card, /description\.addEventListener\('click', \(\) => toggleCard/u);
  assert.match(app, /toggle\.textContent = expanded \? 'Show less' : 'Read more…'/u);
  assert.match(styles, /\.description-toggle \{[\s\S]*?min-height: 28px;/u);
});

test('Activity row includes counted Investigating and In Progress filters', () => {
  assert.match(app, /\['investigating', '🔍 Investigating'\]/u);
  assert.match(app, /\['in-progress', '🛠 In Progress'\]/u);
  assert.match(app, /const button = el\('button', 'chip filter-chip', `\$\{label\} · \$\{count\}`\)/u);
});

test('card metadata adds the last comment age only when a comment exists', () => {
  const card = app.slice(app.indexOf('function createCard'), app.indexOf('function selectedBugs'));
  assert.match(card, /const lastCommentDate = lastCommentAt\(bug\.comments\);/u);
  assert.match(card, /if \(lastCommentDate\) metaParts\.push\(`Last comment \$\{relativeAge\(lastCommentDate, state\.data\.generated_at\)\}`\);/u);
  assert.match(card, /metaParts\.join\(' · '\)/u);
});

test('Closed terminal pills include a best-effort named attribution', () => {
  const card = app.slice(app.indexOf('function createCard'), app.indexOf('function selectedBugs'));
  assert.match(card, /bug\.terminal_attribution\?\.applied_by/u);
  assert.match(card, /` · by \$\{appliedBy\}`/u);
});

test('rendering starts at 50 while filtering and sorting still use the complete dataset', () => {
  assert.match(app, /const INITIAL_RENDER_COUNT = 50;/u);
  assert.match(app, /selected\.slice\(0, state\.renderLimit\)/u);
  assert.match(app, /new IntersectionObserver/u);
  assert.match(app, /state\.renderLimit \+ RENDER_BATCH_COUNT/u);
  assert.ok(app.indexOf('const selected = selectedBugs();') < app.indexOf('selected.slice(0, state.renderLimit)'));
});
