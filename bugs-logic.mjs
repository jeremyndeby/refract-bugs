const DAY_MS = 86_400_000;

export function nextSortState(currentSort, currentDirection, requestedSort) {
  if (currentSort !== requestedSort) return { sort: requestedSort, direction: 'desc' };
  return {
    sort: currentSort,
    direction: currentDirection === 'desc' ? 'asc' : 'desc',
  };
}

export function reactionPillDisplay(item, { limit = 3 } = {}) {
  const maxVisible = Math.max(0, Number.isInteger(limit) ? limit : 3);
  const reactions = Array.isArray(item?.reactions) ? item.reactions : [];
  return {
    visible: reactions.slice(0, maxVisible).map((reaction) => ({
      ...reaction,
      semantic: reaction.emoji === '💜'
        ? 'primary'
        : reaction.negative === true ? 'negative' : 'positive',
    })),
    hiddenCount: Math.max(0, reactions.length - maxVisible),
  };
}

export function bugThreadUrl(bug, guildId) {
  return bug?.status === 'open' && bug?.id
    ? `https://discord.com/channels/${guildId}/${bug.id}`
    : null;
}

export function daysBetween(start, end) {
  if (!start || !end) return null;
  const value = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS));
  return Number.isFinite(value) ? value : null;
}

export function agePillColor(days) {
  const value = Math.max(0, Number(days) || 0);
  if (value < 7) return 'hsl(220 9% 58%)';
  const progress = Math.min(1, (value - 7) / 83);
  const hue = 32 * (1 - progress);
  const saturation = 72 + progress * 10;
  const lightness = 53 + progress * 4;
  return `hsl(${hue.toFixed(1)} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%)`;
}

export function relativeAge(date, reference) {
  const days = Math.max(0, Math.floor((Date.parse(reference) - Date.parse(date)) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export function lastCommentAt(comments) {
  let latestDate = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const comment of Array.isArray(comments) ? comments : []) {
    const timestamp = Date.parse(comment?.date);
    if (Number.isNaN(timestamp) || timestamp <= latestTimestamp) continue;
    latestTimestamp = timestamp;
    latestDate = comment.date;
  }
  return latestDate;
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

function tokens(value) {
  return String(value ?? '')
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function includesQuery(bug, query) {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return true;
  const documentTokens = tokens(`${bug.title} ${bug.body} ${bug.tags.join(' ')}`);
  return queryTokens.every((queryToken) => documentTokens.some((documentToken) =>
    documentToken.startsWith(queryToken) ||
    (queryToken.length >= 5 && editDistance(queryToken, documentToken) <= 2)));
}

export function terminalTagLabel(status) {
  if (status === 'fixed') return 'Fixed';
  if (status === 'duplicate') return 'Duplicate';
  if (status === 'off_topic') return 'Off-topic';
  if (status === 'inactive') return 'Inactive';
  return null;
}

function matchesActivity(bug, activity, generatedAt) {
  if (!activity) return true;
  if (activity === 'active-7d') return bug.activity_7d > 0;
  if (activity === 'discussed') return bug.comments_count > 0;
  if (activity === 'with-images') return bug.images.length > 0;
  if (activity === 'new-7d') return isWithinDays(bug.posted_at, generatedAt, 7);
  if (activity === 'closed-7d') return bug.status !== 'open' && isWithinDays(bug.resolved_at, generatedAt, 7);
  if (activity === 'investigating') return bug.status_tags.some(({ tag }) => tag.includes('Investigating'));
  if (activity === 'in-progress') return bug.status_tags.some(({ tag }) => tag.includes('In Progress'));
  return true;
}

function dateForSort(bug, status) {
  return status === 'closed' ? bug.resolved_at : bug.posted_at;
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
    (status === 'closed' ? bug.status !== 'open' : bug.status === 'open')
    && includesQuery(bug, query)
    && matchesActivity(bug, activity, generatedAt)
    && (!tag || bug.tags.includes(tag) || terminalTagLabel(bug.status) === tag)
  ));
  const multiplier = direction === 'asc' ? 1 : -1;
  return selected.sort((a, b) => {
    let delta = 0;
    if (sort === 'popularity') delta = a.score - b.score;
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
  const duplicate = bugs.filter((bug) => bug.status === 'duplicate').length;
  const offTopic = bugs.filter((bug) => bug.status === 'off_topic').length;
  const inactive = bugs.filter((bug) => bug.status === 'inactive').length;
  const closed = fixed + duplicate + offTopic + inactive;
  const opened24h = bugs.filter((bug) => bug.status === 'open' && isWithinHours(bug.posted_at, generatedAt, 24)).length;
  const opened7d = bugs.filter((bug) => bug.status === 'open' && isWithinDays(bug.posted_at, generatedAt, 7)).length;
  const fixed24h = bugs.filter((bug) => bug.status === 'fixed' && isWithinHours(bug.resolved_at, generatedAt, 24)).length;
  const fixed7d = bugs.filter((bug) => bug.status === 'fixed' && isWithinDays(bug.resolved_at, generatedAt, 7)).length;
  const fixTimes = bugs.filter((bug) => bug.status === 'fixed' && bug.bulk_closed !== true)
    .map((bug) => daysBetween(bug.posted_at, bug.resolved_at))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const avgFixDays = fixTimes.length
    ? fixTimes.reduce((sum, value) => sum + value, 0) / fixTimes.length
    : null;
  const middle = Math.floor(fixTimes.length / 2);
  const medianFixDays = fixTimes.length === 0 ? null
    : fixTimes.length % 2 ? fixTimes[middle] : (fixTimes[middle - 1] + fixTimes[middle]) / 2;
  return {
    open,
    fixed,
    duplicate,
    offTopic,
    inactive,
    closed,
    opened24h,
    opened7d,
    fixed24h,
    fixed7d,
    openDelta24h: opened24h - fixed24h,
    openDelta7d: opened7d - fixed7d,
    avgFixDays,
    medianFixDays,
  };
}

export function teamParticipation(comments = []) {
  const devs = new Map();
  const mods = new Map();
  for (const comment of comments) {
    const teamRole = comment.team_role ?? (comment.team_name ? 'dev' : 'team');
    if (teamRole === 'dev' && comment.team_name) {
      devs.set(comment.team_name, (devs.get(comment.team_name) ?? 0) + 1);
    } else if (teamRole === 'mod' && comment.team_name) {
      mods.set(comment.team_name, (mods.get(comment.team_name) ?? 0) + 1);
    }
  }
  return [
    ...[...devs].map(([name, count]) => ({ kind: 'dev', name, count })),
    ...[...mods].map(([name, count]) => ({ kind: 'mod', name, count })),
  ];
}
