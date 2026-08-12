const DAY_MS = 86_400_000;

export function bugThreadUrl(bug, guildId) {
  return bug?.status === 'open' && bug?.id
    ? `https://discord.com/channels/${guildId}/${bug.id}`
    : null;
}

export function relativeAge(date, reference) {
  const days = Math.max(0, Math.floor((Date.parse(reference) - Date.parse(date)) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export function isWithinDays(date, reference, days) {
  if (!date || !reference) return false;
  const delta = Date.parse(reference) - Date.parse(date);
  return delta >= 0 && delta <= days * DAY_MS;
}

export function isWithinHours(date, reference, hours) {
  if (!date || !reference) return false;
  const delta = Date.parse(reference) - Date.parse(date);
  return delta >= 0 && delta <= hours * 3_600_000;
}

function includesQuery(bug, query) {
  const needle = query.trim().toLocaleLowerCase('en');
  if (!needle) return true;
  const comments = bug.comments.map((comment) => comment.text).join(' ');
  return `${bug.title} ${bug.body} ${bug.tags.join(' ')} ${comments}`.toLocaleLowerCase('en').includes(needle);
}

function matchesActivity(bug, activity, generatedAt) {
  if (!activity) return true;
  if (activity === 'active-7d') return bug.activity_7d > 0;
  if (activity === 'discussed') return bug.comments_count > 0;
  if (activity === 'with-images') return bug.images.length > 0;
  if (activity === 'new-7d') return isWithinDays(bug.posted_at, generatedAt, 7);
  if (activity === 'fixed-7d') return bug.status === 'fixed' && isWithinDays(bug.fixed_at, generatedAt, 7);
  return true;
}

function dateForSort(bug, status) {
  return status === 'fixed' ? bug.fixed_at : bug.posted_at;
}

export function selectBugs(items, {
  status,
  query = '',
  sort = 'popularity',
  direction = 'desc',
  activity = '',
  tag = '',
  generatedAt,
} = {}) {
  const selected = items.filter((bug) => (
    bug.status === status
    && includesQuery(bug, query)
    && matchesActivity(bug, activity, generatedAt)
    && (!tag || bug.tags.includes(tag))
  ));
  const multiplier = direction === 'asc' ? 1 : -1;
  return selected.sort((a, b) => {
    let delta = 0;
    if (sort === 'popularity') delta = a.reactors_unique - b.reactors_unique;
    else if (sort === 'trending') delta = a.activity_7d - b.activity_7d;
    else delta = Date.parse(dateForSort(a, status)) - Date.parse(dateForSort(b, status));
    if (delta === 0) delta = Date.parse(a.posted_at) - Date.parse(b.posted_at);
    if (delta === 0) delta = a.id.localeCompare(b.id);
    return delta * multiplier;
  });
}

export function datasetCounters(bugs, generatedAt) {
  const open = bugs.filter((bug) => bug.status === 'open').length;
  const fixed = bugs.filter((bug) => bug.status === 'fixed').length;
  const opened24h = bugs.filter((bug) => bug.status === 'open' && isWithinHours(bug.posted_at, generatedAt, 24)).length;
  const opened7d = bugs.filter((bug) => bug.status === 'open' && isWithinDays(bug.posted_at, generatedAt, 7)).length;
  const fixed24h = bugs.filter((bug) => bug.status === 'fixed' && isWithinHours(bug.fixed_at, generatedAt, 24)).length;
  const fixed7d = bugs.filter((bug) => bug.status === 'fixed' && isWithinDays(bug.fixed_at, generatedAt, 7)).length;
  return {
    open,
    fixed,
    opened24h,
    opened7d,
    fixed24h,
    fixed7d,
    openDelta24h: opened24h - fixed24h,
    openDelta7d: opened7d - fixed7d,
  };
}
