import { bugThreadUrl, datasetCounters, relativeAge, selectBugs } from './bugs-logic.mjs';
import { validateBugDataset } from './bugs-validator.mjs';

const DISCORD_GUILD_ID = '1490347491151970366';
const VIEWS = ['open', 'fixed'];
const initialParams = new URLSearchParams(location.search);
const ACTIVITY_OPTIONS = {
  open: [
    ['active-7d', 'Active · 7 days'],
    ['new-7d', 'New · 7 days'],
    ['discussed', 'Discussed'],
    ['with-images', 'With images'],
  ],
  fixed: [
    ['active-7d', 'Active · 7 days'],
    ['fixed-30d', 'Fixed · 30 days'],
    ['discussed', 'Discussed'],
    ['with-images', 'With images'],
  ],
};

const state = {
  data: null,
  bugs: [],
  rejected: [],
  view: location.hash === '#fixed' ? 'fixed' : 'open',
  expanded: new Set(initialParams.get('expand') ? [initialParams.get('expand')] : []),
  controls: {
    open: { query: initialParams.get('q') ?? '', sort: 'popularity', activity: '', tag: '' },
    fixed: { query: '', sort: 'date', activity: '', tag: '' },
  },
};

const elements = {
  freshness: document.querySelector('#freshness'),
  openTotal: document.querySelector('#pulse-open-total'),
  fixedTotal: document.querySelector('#pulse-fixed-total'),
  new7d: document.querySelector('#new-last-7-days'),
  active7d: document.querySelector('#active-last-7-days'),
  fixed30d: document.querySelector('#fixed-last-30-days'),
  openCount: document.querySelector('#open-count'),
  fixedCount: document.querySelector('#fixed-count'),
  content: document.querySelector('#bug-content'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  panels: {
    open: document.querySelector('#view-open'),
    fixed: document.querySelector('#view-fixed'),
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

function updateHash(view) {
  const hash = view === 'fixed' ? '#fixed' : '#open';
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
    ['popularity', 'Popularity ↓'],
    ['trending', '🔥 Trending ↓'],
    ['date', 'Date ↓'],
  ];
  for (const [value, label] of options) {
    const button = el('button', 'sort', label);
    button.type = 'button';
    button.dataset.sort = value;
    setButtonState(button, control.sort === value);
    button.addEventListener('click', () => {
      control.sort = value;
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
    const button = el('button', 'filter-chip', label);
    button.type = 'button';
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
  state.bugs.filter((bug) => bug.status === state.view).forEach((bug) => {
    bug.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderTagFilters() {
  elements.tagFilters.replaceChildren();
  const control = state.controls[state.view];
  for (const [tag, count] of tagCounts()) {
    const button = el('button', 'filter-chip', `${tag} · ${count}`);
    button.type = 'button';
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
  elements.search.placeholder = state.view === 'open' ? 'Search open bugs…' : 'Search fixed bugs…';
  elements.searchLabel.textContent = state.view === 'open' ? 'Search open bugs' : 'Search fixed bugs';
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
  button.setAttribute('aria-expanded', String(expanded));
  details.hidden = !expanded;
  card.classList.toggle('is-expanded', expanded);
  if (expanded) {
    state.expanded.add(bugId);
    loadCardImages(card);
  } else {
    state.expanded.delete(bugId);
  }
}

function createComments(bug) {
  const section = el('section', 'bug-thread');
  const heading = el('h3', '', `Discussion · ${bug.comments_count}`);
  section.append(heading);
  if (bug.comments.length === 0) {
    section.append(el('p', 'thread-empty', 'No public comments yet.'));
    return section;
  }
  const list = el('ol', 'comment-list');
  for (const comment of bug.comments) {
    const item = el('li', `comment${comment.is_team ? ' team-comment' : ''}`);
    const head = el('div', 'comment-head');
    if (comment.is_team) head.append(el('span', 'team-badge', 'TEAM'));
    head.append(el('time', '', formatDate(comment.date)));
    const copy = el('p', '', comment.text);
    item.append(head, copy);
    list.append(item);
  }
  section.append(list);
  return section;
}

function createImages(bug) {
  if (bug.images.length === 0) return null;
  const section = el('section', 'bug-images');
  section.append(el('h3', '', `Attachments · ${bug.images.length}`));
  const gallery = el('div', 'image-gallery');
  bug.images.forEach((url, index) => {
    const figure = el('figure', 'bug-image');
    const image = el('img');
    image.dataset.src = url;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = `Bug attachment ${index + 1}`;
    figure.append(image);
    gallery.append(figure);
  });
  section.append(gallery);
  return section;
}

function createCard(bug, rank) {
  const card = el('article', `row bug-card ${bug.status}-card${rank < 3 ? ` rank-${rank + 1}` : ''}`);
  card.dataset.bugId = bug.id;
  const detailsId = `details-${bug.id}`;
  const summary = el('button', 'bug-summary');
  summary.type = 'button';
  summary.setAttribute('aria-controls', detailsId);
  summary.setAttribute('aria-expanded', 'false');

  const votes = el('div', 'votes');
  const prism = el('span', 'prism', '◆');
  prism.setAttribute('aria-hidden', 'true');
  votes.append(prism, el('strong', 'n', String(bug.reactors_unique)), el('span', 'vote-label', 'reactors'));
  if (bug.activity_7d > 0) votes.append(el('span', 'trend', `+${bug.activity_7d} · 7d`));

  const body = el('div', 'body');
  const titleLine = el('div', 'bug-title-line');
  titleLine.append(el('h2', '', bug.title), el('span', 'expand-chevron', '⌄'));
  const description = el('p', 'description', bug.body);
  const meta = el('div', 'meta');
  const primaryDate = bug.status === 'fixed' ? bug.fixed_at : bug.posted_at;
  meta.append(
    el('span', '', bug.status === 'fixed' ? `Fixed ${relativeAge(primaryDate, state.data.generated_at)}` : `Reported ${relativeAge(primaryDate, state.data.generated_at)}`),
    el('span', 'meta-separator', '·'),
    el('span', '', plural(bug.comments_count, 'comment')),
    el('span', 'meta-separator', '·'),
    el('span', '', `${bug.activity_7d} activity · 7 days`),
  );
  const chips = el('div', 'chips');
  bug.tags.forEach((tag) => chips.append(el('span', 'chip', tag)));
  body.append(titleLine, description, meta, chips);
  summary.append(votes, body);

  const details = el('div', 'bug-details');
  details.id = detailsId;
  details.hidden = true;
  const full = el('section', 'bug-full-copy');
  full.append(el('h3', '', 'Report'), el('p', '', bug.body));
  details.append(full, createComments(bug));
  const images = createImages(bug);
  if (images) details.append(images);

  const actions = el('div', 'card-actions');
  if (bug.status === 'open') {
    const url = bugThreadUrl(bug, DISCORD_GUILD_ID);
    const link = el('a', 'meta-action', 'Open thread on Discord ↗');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    actions.append(link);
  } else {
    actions.append(el('span', 'fixed-label', `Resolved ${formatDate(bug.fixed_at)}`));
  }
  const expandHint = el('span', 'expand-hint', 'Click the card to view the discussion');
  actions.append(expandHint);
  summary.addEventListener('click', () => toggleCard(card, summary, details, bug.id));
  card.append(summary, details, actions);

  if (state.expanded.has(bug.id)) toggleCard(card, summary, details, bug.id);
  return card;
}

function selectedBugs() {
  const control = state.controls[state.view];
  return selectBugs(state.bugs, {
    status: state.view,
    query: control.query,
    sort: control.sort,
    direction: 'desc',
    activity: control.activity,
    tag: control.tag,
    generatedAt: state.data.generated_at,
  });
}

function renderList() {
  if (!state.data) return;
  const selected = selectedBugs();
  const total = state.bugs.filter((bug) => bug.status === state.view).length;
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
  selected.forEach((bug, index) => fragment.append(createCard(bug, index)));
  elements.list.append(fragment);
}

function renderCounters() {
  const counters = datasetCounters(state.bugs, state.data.generated_at);
  elements.openTotal.textContent = plural(counters.open, 'open bug');
  elements.fixedTotal.textContent = plural(counters.fixed, 'fixed bug');
  elements.openCount.textContent = counters.open.toLocaleString('en');
  elements.fixedCount.textContent = counters.fixed.toLocaleString('en');
  elements.new7d.textContent = counters.new7d.toLocaleString('en');
  elements.active7d.textContent = counters.active7d.toLocaleString('en');
  elements.fixed30d.textContent = counters.fixed30d.toLocaleString('en');
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
  const next = state.view === 'open' ? 'fixed' : 'open';
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
window.addEventListener('hashchange', () => setView(location.hash === '#fixed' ? 'fixed' : 'open', { updateLocation: false }));
window.addEventListener('scroll', () => {
  const visible = window.scrollY > 600;
  elements.backToTop.classList.toggle('is-visible', visible);
  elements.backToTop.setAttribute('aria-hidden', String(!visible));
  elements.backToTop.tabIndex = visible ? 0 : -1;
}, { passive: true });
elements.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

load();
