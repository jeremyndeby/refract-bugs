import { agePillColor, bugThreadUrl, datasetCounters, daysBetween, nextSortState, reactionPillDisplay, relativeAge, selectBugs, teamParticipation, terminalTagLabel } from './bugs-logic.mjs';
import { validateBugDataset } from './bugs-validator.mjs';

const DISCORD_GUILD_ID = '1490347491151970366';
const VIEWS = ['open', 'closed'];
const initialParams = new URLSearchParams(location.search);
const ACTIVITY_OPTIONS = {
  open: [
    ['active-7d', 'Active · 7 days'],
    ['new-7d', 'New · 7 days'],
    ['discussed', 'Discussed'],
    ['with-images', 'With images'],
  ],
  closed: [
    ['active-7d', 'Active · 7 days'],
    ['closed-7d', 'Closed · 7 days'],
    ['discussed', 'Discussed'],
    ['with-images', 'With images'],
  ],
};

const TAG_COLORS = Object.freeze({
  Accessibility: '#D6A2E8',
  Android: '#7BED9F',
  Calendar: '#FFEAA7',
  Collections: '#FAB1A0',
  Discovery: '#FFEAA7',
  Filters: '#81ECEC',
  Import: '#81ECEC',
  iOS: { accent: '#0984E3', text: '#A8D8FF' },
  Layout: '#00CEC9',
  Metadata: { accent: '#FD79A8', text: '#FFBBD9' },
  Navigation: '#A29BFE',
  Notifications: '#FDCB6E',
  Performance: '#55EFC4',
  Playback: { accent: '#E17055', text: '#FFC2AE' },
  Profiles: '#55EFC4',
  Reviews: '#FAB1A0',
  Search: { accent: '#3498DB', text: '#A9DCFF' },
  Settings: '#D6A2E8',
  Sync: '#81ECEC',
  Timezone: '#B2BEC3',
  Tracking: '#55EFC4',
  Watchlist: '#00CEC9',
  Web: { accent: '#6C5CE7', text: '#C8C4FF' },
  Widgets: '#FDCB6E',
  Fixed: '#55EFC4',
  Duplicate: '#A29BFE',
  'Off-topic': '#FDCB6E',
});

const state = {
  data: null,
  bugs: [],
  rejected: [],
  view: ['#fixed', '#closed'].includes(location.hash) ? 'closed' : 'open',
  expanded: new Set(initialParams.get('expand') ? [initialParams.get('expand')] : []),
  controls: {
    open: { query: initialParams.get('q') ?? '', sort: 'popularity', direction: 'desc', activity: '', tag: '' },
    closed: { query: '', sort: 'date', direction: 'desc', activity: '', tag: '' },
  },
};

const elements = {
  freshness: document.querySelector('#freshness'),
  openTotal: document.querySelector('#pulse-open-total'),
  openChange24h: document.querySelector('#open-change-24h'),
  openChange7d: document.querySelector('#open-change-7d'),
  opened24h: document.querySelector('#opened-last-24-hours'),
  opened7d: document.querySelector('#opened-last-7-days'),
  fixed24h: document.querySelector('#fixed-last-24-hours'),
  fixed7d: document.querySelector('#fixed-last-7-days'),
  avgFixTime: document.querySelector('#avg-fix-time'),
  openCount: document.querySelector('#open-count'),
  closedCount: document.querySelector('#closed-count'),
  content: document.querySelector('#bug-content'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  panels: {
    open: document.querySelector('#view-open'),
    closed: document.querySelector('#view-closed'),
  },
  sorts: document.querySelector('#bug-sorts'),
  activityFilters: document.querySelector('#activity-filters'),
  tagFilters: document.querySelector('#tag-filters'),
  search: document.querySelector('#bug-search'),
  searchLabel: document.querySelector('#bug-search-label'),
  resultCount: document.querySelector('#result-count'),
  list: document.querySelector('#bug-list'),
  rejectedNotice: document.querySelector('#rejected-notice'),
  clear: document.querySelector('#clear-filters'),
  backToTop: document.querySelector('#back-to-top'),
  lightbox: document.querySelector('#image-lightbox'),
  lightboxImage: document.querySelector('#lightbox-image'),
  lightboxClose: document.querySelector('#lightbox-close'),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value.toLocaleString('en')} ${value === 1 ? singular : pluralForm}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function setButtonState(button, active) {
  button.setAttribute('aria-pressed', String(active));
}

function setChipColor(node, color) {
  const accent = typeof color === 'string' ? color : color.accent;
  const text = typeof color === 'string' ? color : color.text;
  node.style.setProperty('--chip-color', accent);
  node.style.setProperty('--chip-text', text);
  node.style.setProperty('--chip-selected', text);
}

function tagColor(tag) {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  let hash = 0;
  for (const character of tag) hash = ((hash * 31) + character.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  return { accent: `hsl(${hue} 62% 55%)`, text: `hsl(${hue} 74% 82%)` };
}

function updateHash(view) {
  const hash = view === 'closed' ? '#closed' : '#open';
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function setView(view, { updateLocation = true } = {}) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  for (const tab of elements.tabs) {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const [name, panel] of Object.entries(elements.panels)) {
    panel.hidden = name !== view;
    if (name === view) panel.append(elements.content);
  }
  if (updateLocation) updateHash(view);
  renderControls();
  renderList();
}

function renderSorts() {
  elements.sorts.replaceChildren();
  const control = state.controls[state.view];
  const options = [
    ['popularity', 'Popularity'],
    ['trending', '🔥 Trending'],
    ['date', 'Date'],
  ];
  for (const [value, name] of options) {
    const active = control.sort === value;
    const direction = active ? control.direction : null;
    const arrow = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
    const button = el('button', 'sort', `${name} ${arrow}`);
    button.type = 'button';
    button.dataset.sort = value;
    button.dataset.direction = direction ?? 'both';
    button.setAttribute('aria-label', active
      ? `${name.replace('🔥 ', '')}, ${direction === 'asc' ? 'ascending' : 'descending'}. Activate to reverse.`
      : `Sort by ${name.replace('🔥 ', '')}, descending.`);
    setButtonState(button, active);
    button.addEventListener('click', () => {
      const next = nextSortState(control.sort, control.direction, value);
      control.sort = next.sort;
      control.direction = next.direction;
      renderControls();
      renderList();
    });
    elements.sorts.append(button);
  }
}

function renderActivityFilters() {
  elements.activityFilters.replaceChildren();
  const control = state.controls[state.view];
  for (const [value, label] of ACTIVITY_OPTIONS[state.view]) {
    const button = el('button', 'chip filter-chip', label);
    button.type = 'button';
    setChipColor(button, { accent: '#B2BEC3', text: '#DFE6E9' });
    setButtonState(button, control.activity === value);
    button.addEventListener('click', () => {
      control.activity = control.activity === value ? '' : value;
      renderControls();
      renderList();
    });
    elements.activityFilters.append(button);
  }
}

function tagCounts() {
  const counts = new Map();
  state.bugs.filter((bug) => state.view === 'closed' ? bug.status !== 'open' : bug.status === 'open').forEach((bug) => {
    const values = [...bug.tags, ...(terminalTagLabel(bug.status) ? [terminalTagLabel(bug.status)] : [])];
    values.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderTagFilters() {
  elements.tagFilters.replaceChildren();
  const control = state.controls[state.view];
  for (const [tag, count] of tagCounts()) {
    const button = el('button', 'chip filter-chip', `${tag} · ${count}`);
    button.type = 'button';
    setChipColor(button, tagColor(tag));
    setButtonState(button, control.tag === tag);
    button.addEventListener('click', () => {
      control.tag = control.tag === tag ? '' : tag;
      renderControls();
      renderList();
    });
    elements.tagFilters.append(button);
  }
}

function renderControls() {
  const control = state.controls[state.view];
  elements.search.value = control.query;
  elements.search.placeholder = state.view === 'open' ? 'Search open bugs…' : 'Search closed bugs…';
  elements.searchLabel.textContent = state.view === 'open' ? 'Search open bugs' : 'Search closed bugs';
  renderSorts();
  renderActivityFilters();
  renderTagFilters();
  elements.clear.hidden = !control.query && !control.activity && !control.tag;
}

function loadCardImages(card) {
  card.querySelectorAll('img[data-src]').forEach((image) => {
    if (!image.src) image.src = image.dataset.src;
  });
}

function toggleCard(card, button, details, bugId) {
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  card.querySelectorAll(`[aria-controls="${details.id}"]`).forEach((control) => {
    control.setAttribute('aria-expanded', String(expanded));
    if (control.classList.contains('comment-toggle')) {
      control.setAttribute('aria-label', expanded ? control.dataset.closeLabel : control.dataset.openLabel);
    }
  });
  details.hidden = !expanded;
  card.classList.toggle('is-expanded', expanded);
  if (expanded) {
    state.expanded.add(bugId);
    loadCardImages(card);
  } else {
    state.expanded.delete(bugId);
  }
}

function stableColor(value, { saturation = 55, lightness = 78 } = {}) {
  let hash = 0;
  for (const character of String(value)) hash = ((hash * 33) + character.codePointAt(0)) >>> 0;
  return `hsl(${hash % 360} ${saturation}% ${lightness}%)`;
}

function createComments(bug, collapse) {
  const section = el('section', 'bug-thread');
  const header = el('div', 'discussion-heading');
  const heading = el('h3', '', `Discussion · ${bug.comments_count}`);
  const close = el('button', 'discussion-collapse', '⌃');
  close.type = 'button';
  close.setAttribute('aria-label', `Close discussion for ${bug.title}`);
  close.addEventListener('click', collapse);
  header.append(heading, close);
  section.append(header);
  const participation = createTeamParticipationRow(bug);
  if (participation) section.append(participation);
  if (bug.comments.length === 0) {
    section.append(el('p', 'thread-empty', 'No public comments yet.'));
    return section;
  }
  const list = el('ol', 'comment-list');
  for (const comment of bug.comments) {
    const isOp = comment.author_key === bug.author_key;
    const teamRole = comment.is_team ? comment.team_role ?? (comment.team_name ? 'dev' : 'team') : null;
    const teamClass = teamRole === 'dev' ? ' team-comment dev-comment'
      : teamRole === 'mod' ? ' team-comment mod-comment'
        : comment.is_team ? ' team-comment' : '';
    const item = el('li', `comment${teamClass || (isOp ? ' op-comment' : '')}`);
    const head = el('div', 'comment-head');
    if (comment.is_team) {
      head.append(el('span', `team-badge${teamRole === 'mod' ? ' mod-badge' : ''}`, teamRole === 'mod' ? 'MOD' : 'TEAM'));
      if ((teamRole === 'dev' || teamRole === 'mod') && comment.team_name) {
        const memberName = el('span', teamRole === 'mod' ? 'mod-name' : 'dev-name', comment.team_name);
        if (teamRole === 'dev') {
          memberName.style.setProperty('--author-color', stableColor(comment.team_name, { saturation: 70, lightness: 72 }));
        }
        head.append(memberName);
      }
    }
    if (!comment.is_team || isOp) {
      const author = el('span', 'author-key', comment.author_key);
      author.style.setProperty('--author-color', stableColor(`${bug.id}:${comment.author_key}`));
      head.append(author);
    }
    if (isOp) head.append(el('span', 'op-badge', 'OP'));
    head.append(el('time', '', formatDate(comment.date)));
    const copy = el('p', '', comment.text);
    item.append(head, copy);
    const reactions = createReactionRow(comment, { compact: true, limit: 8 });
    if (reactions) item.append(reactions);
    list.append(item);
  }
  section.append(list);
  return section;
}

function openLightbox(url) {
  elements.lightboxImage.src = url;
  elements.lightbox.hidden = false;
  document.body.classList.add('lightbox-open');
  elements.lightboxClose.focus();
}

function closeLightbox() {
  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute('src');
  document.body.classList.remove('lightbox-open');
}

function createThumbnail(bug) {
  const imageRecord = bug.images[0];
  if (!imageRecord?.url) return null;
  const button = el('button', 'bug-thumbnail');
  button.type = 'button';
  button.setAttribute('aria-label', `Open attachment for ${bug.title}`);
  const image = el('img');
  image.src = imageRecord.thumb ?? imageRecord.url;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.alt = 'Bug attachment';
  image.addEventListener('error', () => button.remove(), { once: true });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openLightbox(imageRecord.url);
  });
  button.append(image);
  return button;
}

function reactionEmoji(emoji) {
  if (typeof emoji === 'string') return el('span', 'reaction-emoji', emoji);
  const fallback = el('span', 'reaction-fallback', `:${emoji.name}:`);
  fallback.setAttribute('aria-label', `Custom emoji ${emoji.name}`);
  return fallback;
}

function createReactionRow(item, { compact = false, limit = 3 } = {}) {
  const display = reactionPillDisplay(item, { limit });
  if (display.visible.length === 0) return null;
  const row = el('div', `reaction-row${compact ? ' compact' : ''}`);
  row.setAttribute('aria-label', 'Reactions');
  for (const reaction of display.visible) {
    const pill = el('span', `reaction-pill reaction-${reaction.semantic}`);
    pill.append(reactionEmoji(reaction.emoji), el('span', '', reaction.count.toLocaleString('en')));
    row.append(pill);
  }
  if (display.hiddenCount > 0) {
    const overflow = el('span', 'reaction-overflow', `+${display.hiddenCount.toLocaleString('en')}`);
    overflow.setAttribute('aria-label', plural(display.hiddenCount, 'additional reaction'));
    row.append(overflow);
  }
  return row;
}

function createTeamParticipationRow(bug) {
  const participation = teamParticipation(bug.comments);
  if (participation.length === 0) return null;
  const row = el('div', 'team-participation-row');
  row.setAttribute('aria-label', 'Team participation');
  for (const participant of participation) {
    const pill = el(
      'span',
      `team-participation-pill ${participant.kind === 'mod' ? 'mod-participation-pill' : 'dev-participation-pill'}`,
      `${participant.name} · ${participant.count}`,
    );
    if (participant.kind === 'dev') {
      pill.style.setProperty('--participant-color', stableColor(participant.name, { saturation: 70, lightness: 72 }));
    }
    row.append(pill);
  }
  return row;
}

function rankMark(rank) {
  if (rank === 1) return '🥇 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  return `#${rank}`;
}

function createRankBadge(rank) {
  const badge = el('span', `rank-badge rank-badge-${rank <= 3 ? rank : 'other'}`, rankMark(rank));
  badge.setAttribute('aria-label', `Popularity rank ${rank}`);
  return badge;
}

function createOpenEdgeBadge(bug) {
  const ageDays = daysBetween(bug.posted_at, state.data.generated_at) ?? 0;
  const ageColor = agePillColor(ageDays);
  const statusTags = [...bug.status_tags].sort((left, right) => {
    const order = (tag) => tag.includes('Investigating') ? 0 : tag.includes('In Progress') ? 1 : 2;
    return order(left.tag) - order(right.tag);
  });
  const statusClass = statusTags.some(({ tag }) => tag.includes('In Progress'))
    ? 'status-badge-progress'
    : statusTags.length > 0 ? 'status-badge-investigating' : 'bug-age-only';
  const badge = el(
    'span',
    `edge-badge status-badge status-badge-with-eta bug-edge-badge ${statusClass}`,
  );

  for (const statusTag of statusTags) {
    const label = statusTag.applied_by ? `${statusTag.tag} · by ${statusTag.applied_by}` : statusTag.tag;
    badge.append(el('span', 'status-badge-label bug-status-badge-label', label));
  }

  const age = el('span', 'eta-badge bug-age-badge', `${ageDays}d`);
  badge.style.setProperty('--age-color', ageColor);
  age.style.setProperty('--age-color', ageColor);
  badge.append(age);
  badge.setAttribute('aria-label', [
    ...statusTags.map(({ tag, applied_by: appliedBy }) => appliedBy ? `${tag}, by ${appliedBy}` : tag),
    `${ageDays} days old`,
  ].join(', '));
  return badge;
}

function createCard(bug, rank) {
  const card = el('article', `row bug-card ${bug.status}-card${rank <= 3 ? ` rank-${rank}` : ''}`);
  card.dataset.bugId = bug.id;
  if (bug.status === 'open') card.append(createRankBadge(rank), createOpenEdgeBadge(bug));
  const detailsId = `details-${bug.id}`;
  const summary = el('button', 'bug-summary');
  summary.type = 'button';
  summary.setAttribute('aria-controls', detailsId);
  summary.setAttribute('aria-expanded', 'false');

  const votes = el('div', 'votes');
  const prism = el('span', 'prism', '◆');
  prism.setAttribute('aria-hidden', 'true');
  votes.append(prism, el('strong', 'n', String(Math.round(bug.score))), el('span', 'vote-label', 'score'));
  if (bug.activity_7d > 0) votes.append(el('span', 'trend', `+${bug.activity_7d} · 7d`));

  const body = el('div', 'body');
  const titleLine = el('div', 'bug-title-line');
  titleLine.append(el('h2', '', bug.title));
  if (bug.status !== 'open') {
    const days = daysBetween(bug.posted_at, bug.resolved_at) ?? 0;
    const labels = {
      fixed: '✅ Fixed', duplicate: '🔁 Duplicate', off_topic: '🚫 Off-topic',
    };
    titleLine.append(el('span', `terminal-pill terminal-${bug.status}`, `${labels[bug.status]} · ${days}d`));
  }
  const description = el('p', 'description');
  const opAuthor = el('span', 'card-op-author', bug.author_key);
  opAuthor.style.setProperty('--author-color', stableColor(`${bug.id}:${bug.author_key}`));
  description.append(opAuthor, document.createTextNode(` — ${bug.body}`));
  const meta = el('div', 'meta');
  meta.append(el('span', '', `Reported ${relativeAge(bug.posted_at, state.data.generated_at)}`));
  const chips = el('div', 'chips');
  bug.tags.forEach((tag) => {
    const chip = el('span', 'chip', tag);
    setChipColor(chip, tagColor(tag));
    chips.append(chip);
  });
  body.append(titleLine, description);
  const thumbnail = createThumbnail(bug);
  const reactions = createReactionRow(bug);
  if (reactions) body.append(reactions);
  body.append(meta, chips);
  summary.append(votes, body);

  const details = el('div', 'bug-details');
  details.id = detailsId;
  details.hidden = true;
  details.append(createComments(bug, () => toggleCard(card, summary, details, bug.id)));

  const actions = el('div', 'card-actions');
  if (bug.status === 'open') {
    const url = bugThreadUrl(bug, DISCORD_GUILD_ID);
    const link = el('a', 'meta-action', 'Open thread on Discord ↗');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    actions.append(link);
  } else {
    actions.append(el('span', 'fixed-label', `Resolved ${formatDate(bug.resolved_at)}`));
  }
  const commentToggle = el('button', 'comment-toggle');
  commentToggle.type = 'button';
  commentToggle.setAttribute('aria-controls', detailsId);
  commentToggle.setAttribute('aria-expanded', 'false');
  commentToggle.setAttribute('aria-label', `Open discussion for ${bug.title}`);
  commentToggle.dataset.openLabel = `Open discussion for ${bug.title}`;
  commentToggle.dataset.closeLabel = `Close discussion for ${bug.title}`;
  commentToggle.append(el('span', 'comment-arrow', '⌄'));
  const commentTotal = el('span', 'comment-total-pill');
  commentTotal.setAttribute('aria-label', plural(bug.comments_count, 'comment'));
  commentTotal.append(
    el('span', 'comment-bubble', '💬'),
    el('span', 'comment-count', String(bug.comments_count)),
  );
  const discussionActions = el('div', 'discussion-actions');
  const teamParticipationRow = createTeamParticipationRow(bug);
  if (teamParticipationRow) discussionActions.append(teamParticipationRow);
  discussionActions.append(commentTotal, commentToggle);
  actions.append(discussionActions);
  summary.addEventListener('click', () => toggleCard(card, summary, details, bug.id));
  commentToggle.addEventListener('click', () => toggleCard(card, commentToggle, details, bug.id));
  card.append(summary);
  if (thumbnail) card.append(thumbnail);
  card.append(details, actions);

  if (state.expanded.has(bug.id)) toggleCard(card, summary, details, bug.id);
  return card;
}

function selectedBugs() {
  const control = state.controls[state.view];
  return selectBugs(state.bugs, {
    status: state.view,
    query: control.query,
    sort: control.sort,
    direction: control.direction,
    activity: control.activity,
    tag: control.tag,
    generatedAt: state.data.generated_at,
  });
}

function renderList() {
  if (!state.data) return;
  const selected = selectedBugs();
  const total = state.bugs.filter((bug) => state.view === 'closed' ? bug.status !== 'open' : bug.status === 'open').length;
  elements.resultCount.textContent = selected.length === total
    ? plural(total, 'bug')
    : `${plural(selected.length, 'bug')} of ${total}`;
  elements.list.replaceChildren();
  if (selected.length === 0) {
    const empty = el('div', 'empty');
    empty.append(el('strong', '', 'No bugs match these filters.'), el('span', '', 'Try another search or clear the active filters.'));
    elements.list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  const popularityRanks = new Map(selectBugs(state.bugs, {
    status: 'open', sort: 'popularity', direction: 'desc', generatedAt: state.data.generated_at,
  }).map((bug, index) => [bug.id, index + 1]));
  selected.forEach((bug, index) => fragment.append(createCard(bug, popularityRanks.get(bug.id) ?? index + 1)));
  elements.list.append(fragment);
}

function renderCounters() {
  const counters = datasetCounters(state.bugs, state.data.generated_at);
  const formatChange = (delta, period) => {
    const previous = counters.open - delta;
    const percentage = previous > 0 ? Math.round((delta / previous) * 100) : 0;
    const signed = (value) => value > 0 ? `+${value}` : String(value);
    return `${signed(delta)} · ${signed(percentage)}% last ${period}`;
  };
  elements.openTotal.textContent = `${counters.open.toLocaleString('en')} open`;
  elements.openChange24h.textContent = formatChange(counters.openDelta24h, '24h');
  elements.openChange7d.textContent = formatChange(counters.openDelta7d, '7d');
  elements.openCount.textContent = counters.open.toLocaleString('en');
  elements.closedCount.textContent = counters.closed.toLocaleString('en');
  elements.opened24h.textContent = counters.opened24h.toLocaleString('en');
  elements.opened7d.textContent = counters.opened7d.toLocaleString('en');
  elements.fixed24h.textContent = counters.fixed24h.toLocaleString('en');
  elements.fixed7d.textContent = counters.fixed7d.toLocaleString('en');
  elements.avgFixTime.textContent = counters.avgFixDays === null ? '—' : `${Math.round(counters.avgFixDays)}d`;
  elements.freshness.textContent = `updated ${relativeAge(state.data.generated_at, new Date().toISOString())}`;
  elements.freshness.dateTime = state.data.generated_at;
}

function renderFatal(message) {
  elements.list.replaceChildren();
  const error = el('div', 'empty error-state');
  error.append(el('strong', '', 'The public bug feed is unavailable.'), el('span', '', message));
  elements.list.append(error);
  elements.resultCount.textContent = '';
}

async function load() {
  try {
    const response = await fetch('./bugs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const validation = validateBugDataset(data);
  if (validation.rootErrors.length || validation.blocked) {
      console.error('Bug publication rejected', validation);
      throw new Error('Validation threshold exceeded.');
    }
    state.data = data;
    state.bugs = validation.accepted;
    state.rejected = validation.rejected;
    if (validation.rejected.length) {
      console.warn('Rejected invalid bug entries', validation.rejected);
      elements.rejectedNotice.hidden = false;
      elements.rejectedNotice.textContent = `${validation.rejected.length} invalid ${validation.rejected.length === 1 ? 'entry was' : 'entries were'} omitted.`;
    }
    elements.list.setAttribute('aria-busy', 'false');
    renderCounters();
    setView(state.view, { updateLocation: false });
  } catch (error) {
    console.error(error);
    renderFatal('Please try again after the next six-hour refresh.');
  }
}

elements.tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
document.querySelector('#bug-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const next = state.view === 'open' ? 'closed' : 'open';
  setView(next);
  elements.tabs.find((tab) => tab.dataset.view === next)?.focus();
});
elements.search.addEventListener('input', () => {
  state.controls[state.view].query = elements.search.value;
  renderControls();
  renderList();
});
elements.clear.addEventListener('click', () => {
  state.controls[state.view] = {
    ...state.controls[state.view], query: '', activity: '', tag: '',
  };
  renderControls();
  renderList();
  elements.search.focus();
});
window.addEventListener('hashchange', () => setView(['#fixed', '#closed'].includes(location.hash) ? 'closed' : 'open', { updateLocation: false }));
window.addEventListener('scroll', () => {
  const visible = window.scrollY > 600;
  elements.backToTop.classList.toggle('is-visible', visible);
  elements.backToTop.setAttribute('aria-hidden', String(!visible));
  elements.backToTop.tabIndex = visible ? 0 : -1;
}, { passive: true });
elements.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
elements.lightboxClose.addEventListener('click', closeLightbox);
elements.lightbox.addEventListener('click', (event) => {
  if (event.target === elements.lightbox) closeLightbox();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.lightbox.hidden) closeLightbox();
});

load();
