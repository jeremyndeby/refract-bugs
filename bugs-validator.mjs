export const MAX_REJECTED_ENTRIES = 20;
export const MAX_REJECTED_RATIO = 0.05;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const TOKEN_PATTERN = /(?:mfa\.[A-Z0-9_-]{20,}|(?:gh[oprsu]_|sk-|xox[baprs]-)[A-Z0-9_-]{16,}|(?:token|secret|password|authorization)\s*[:=]\s*\S+)/iu;
const ID_PATTERN = /^[0-9]{17,20}$/u;
const LOCAL_IMAGE_PATTERN = /^\.\/assets\/bugs\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/u;
const AUTHOR_KEY_PATTERN = /^[A-Za-z][A-Za-z -]{2,47}$/u;
const STATUSES = new Set(['open', 'fixed', 'duplicate', 'off_topic', 'inactive']);
const STATUS_TAGS = new Set(['🔍 Investigating', '🛠 In Progress']);
const RAW_CUSTOM_EMOJI_PATTERN = /<a?:[A-Za-z0-9_]{1,32}:\d{17,20}>/u;

function isDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function collectStrings(value, path = '$', result = []) {
  if (typeof value === 'string') result.push({ path, value });
  else if (Array.isArray(value)) value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, result));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => collectStrings(entry, `${path}.${key}`, result));
  return result;
}

export function sensitivePattern(value) {
  if (EMAIL_PATTERN.test(value)) return 'email';
  if (TOKEN_PATTERN.test(value)) return 'token';
  if (RAW_CUSTOM_EMOJI_PATTERN.test(value)) return 'raw Discord custom emoji';
  return null;
}

function validateReactionList(reactions, prefix, errors) {
  if (!Array.isArray(reactions) || reactions.length > 50) {
    errors.push(`${prefix} must be an array with at most 50 values`);
    return;
  }
  const identities = new Set();
  reactions.forEach((reaction, index) => {
    const path = `${prefix}[${index}]`;
    if (!reaction || typeof reaction !== 'object' || Array.isArray(reaction)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const keys = Object.keys(reaction);
    if (keys.some((key) => !['emoji', 'count', 'negative'].includes(key)) || !keys.includes('emoji') || !keys.includes('count')) errors.push(`${path} has an invalid shape`);
    let identity = null;
    if (typeof reaction.emoji === 'string') {
      if (!reaction.emoji || reaction.emoji.length > 32) errors.push(`${path}.emoji must contain 1 to 32 characters`);
      identity = `unicode:${reaction.emoji}`;
    } else if (reaction.emoji && typeof reaction.emoji === 'object' && !Array.isArray(reaction.emoji)) {
      const emojiKeys = Object.keys(reaction.emoji);
      if (emojiKeys.length !== 2 || !emojiKeys.includes('name') || !emojiKeys.includes('id')) errors.push(`${path}.emoji has an invalid custom emoji shape`);
      if (typeof reaction.emoji.name !== 'string' || !reaction.emoji.name.trim() || reaction.emoji.name.length > 64 || /[@\r\n]/u.test(reaction.emoji.name)) errors.push(`${path}.emoji.name is invalid`);
      if (typeof reaction.emoji.id !== 'string' || !ID_PATTERN.test(reaction.emoji.id)) errors.push(`${path}.emoji.id must contain 17 to 20 digits`);
      identity = `custom:${reaction.emoji.id}`;
    } else errors.push(`${path}.emoji must be Unicode text or a custom emoji object`);
    if (!Number.isInteger(reaction.count) || reaction.count < 1) errors.push(`${path}.count must be a positive integer`);
    if ('negative' in reaction && typeof reaction.negative !== 'boolean') errors.push(`${path}.negative must be boolean`);
    if (identity && identities.has(identity)) errors.push(`${prefix} must contain unique emoji`);
    if (identity) identities.add(identity);
  });
}

function validateComments(entry, errors) {
  if (!Array.isArray(entry.comments)) {
    errors.push('comments must be an array');
    return;
  }
  entry.comments.forEach((comment, index) => {
    const prefix = `comments[${index}]`;
    if (!comment || typeof comment !== 'object' || Array.isArray(comment)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const required = ['text', 'date', 'is_team', 'author_key', 'reactions'];
    const keys = Object.keys(comment);
    if (keys.some((key) => ![...required, 'team_role', 'team_name'].includes(key)) || required.some((key) => !keys.includes(key))) errors.push(`${prefix} has an invalid shape`);
    if (typeof comment.text !== 'string' || !comment.text.trim() || comment.text.length > 4000) errors.push(`${prefix}.text must be non-empty public text`);
    if (!isDate(comment.date)) errors.push(`${prefix}.date must be an ISO date-time`);
    if (typeof comment.is_team !== 'boolean') errors.push(`${prefix}.is_team must be boolean`);
    if (typeof comment.author_key !== 'string' || !AUTHOR_KEY_PATTERN.test(comment.author_key)) errors.push(`${prefix}.author_key must be a neutral pseudonym`);
    const validTeamRole = ['dev', 'mod', 'team'].includes(comment.team_role);
    if (comment.is_team && !validTeamRole) errors.push(`${prefix}.team_role is required on TEAM comments`);
    if (!comment.is_team && 'team_role' in comment) errors.push(`${prefix}.team_role is allowed only on TEAM comments`);
    if (comment.team_role === 'dev' || comment.team_role === 'mod') {
      if (typeof comment.team_name !== 'string' || !comment.team_name.trim() || comment.team_name.length > 80 || /[@|\r\n]|\p{Extended_Pictographic}/u.test(comment.team_name)) errors.push(`${prefix}.team_name is required for Dev and Mod and must be safe public text`);
    } else if ('team_name' in comment) {
      errors.push(`${prefix}.team_name is allowed only for Dev and Mod comments`);
    }
    validateReactionList(comment.reactions, `${prefix}.reactions`, errors);
  });
  if (Number.isInteger(entry.comments_count) && entry.comments_count !== entry.comments.length) errors.push('comments_count must equal comments.length');
}

function validateStatusTags(statusTags, errors) {
  if (!Array.isArray(statusTags) || statusTags.length > 2) {
    errors.push('status_tags must be an array with at most two values');
    return;
  }
  const seen = new Set();
  statusTags.forEach((statusTag, index) => {
    const prefix = `status_tags[${index}]`;
    if (!statusTag || typeof statusTag !== 'object' || Array.isArray(statusTag)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const keys = Object.keys(statusTag);
    if (!keys.includes('tag') || keys.some((key) => !['tag', 'applied_by', 'applied_at'].includes(key))) errors.push(`${prefix} has an invalid shape`);
    if (!STATUS_TAGS.has(statusTag.tag)) errors.push(`${prefix}.tag is unsupported`);
    if (seen.has(statusTag.tag)) errors.push('status_tags must be unique by tag');
    seen.add(statusTag.tag);
    if ('applied_by' in statusTag && (typeof statusTag.applied_by !== 'string' || !statusTag.applied_by.trim() || statusTag.applied_by.length > 80 || /[@\r\n]/u.test(statusTag.applied_by))) errors.push(`${prefix}.applied_by must be safe Dev display text`);
    if ('applied_at' in statusTag && !isDate(statusTag.applied_at)) errors.push(`${prefix}.applied_at must be an ISO date-time`);
  });
}

function validateTerminalAttribution(attribution, errors) {
  if (attribution === null) return;
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) {
    errors.push('terminal_attribution must be an object or null');
    return;
  }
  const keys = Object.keys(attribution);
  if (keys.some((key) => !['applied_by', 'applied_at'].includes(key))) errors.push('terminal_attribution has an invalid shape');
  if ('applied_by' in attribution && (
    typeof attribution.applied_by !== 'string' || !attribution.applied_by.trim() ||
    attribution.applied_by.length > 80 || /[@|\r\n]|\p{Extended_Pictographic}/u.test(attribution.applied_by)
  )) errors.push('terminal_attribution.applied_by must be a safe Dev or Mod display name');
  if ('applied_at' in attribution && !isDate(attribution.applied_at)) errors.push('terminal_attribution.applied_at must be an ISO date-time');
}

function validateImages(images, errors) {
  if (!Array.isArray(images) || images.length > 1) {
    errors.push('images must be an array with at most one value');
    return;
  }
  images.forEach((image, index) => {
    const prefix = `images[${index}]`;
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const keys = Object.keys(image);
    if (!keys.includes('url') || keys.some((key) => !['url', 'thumb'].includes(key))) errors.push(`${prefix} has an invalid shape`);
    if (typeof image.url !== 'string' || !LOCAL_IMAGE_PATTERN.test(image.url)) errors.push(`${prefix}.url must use a local repository URL`);
    if ('thumb' in image && (typeof image.thumb !== 'string' || !LOCAL_IMAGE_PATTERN.test(image.thumb))) errors.push(`${prefix}.thumb must use a local repository URL`);
  });
}

export function validateBugEntry(entry) {
  const errors = [];
  const allowedKeys = new Set([
    'id', 'title', 'body', 'author_key', 'posted_at', 'status', 'resolved_at', 'terminal_attribution', 'tags', 'status_tags', 'bulk_closed',
    'reactors_unique', 'score', 'reactions', 'comments_count', 'activity_7d', 'comments', 'images',
  ]);
  const optionalKeys = new Set(['bulk_closed']);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['entry must be an object'];
  for (const key of Object.keys(entry)) if (!allowedKeys.has(key)) errors.push(`unexpected field: ${key}`);
  for (const key of allowedKeys) if (!optionalKeys.has(key) && !(key in entry)) errors.push(`missing field: ${key}`);
  if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) errors.push('id must contain 17 to 20 digits');
  if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 4000) errors.push('title must be non-empty public text');
  if (typeof entry.body !== 'string' || !entry.body.trim() || entry.body.length > 4000) errors.push('body must be non-empty public text');
  if (typeof entry.author_key !== 'string' || !AUTHOR_KEY_PATTERN.test(entry.author_key)) errors.push('author_key must be a neutral per-post pseudonym');
  if (!isDate(entry.posted_at)) errors.push('posted_at must be an ISO date-time');
  if (!STATUSES.has(entry.status)) errors.push('status must be open, fixed, duplicate, off_topic or inactive');
  if ('bulk_closed' in entry && typeof entry.bulk_closed !== 'boolean') errors.push('bulk_closed must be a boolean');
  if (entry.status === 'open' && entry.resolved_at !== null) errors.push('open bugs must have resolved_at set to null');
  if (entry.status !== 'open' && !isDate(entry.resolved_at)) errors.push('closed bugs must have a resolved_at date-time');
  if (isDate(entry.posted_at) && isDate(entry.resolved_at) && Date.parse(entry.resolved_at) < Date.parse(entry.posted_at)) errors.push('resolved_at cannot precede posted_at');
  validateTerminalAttribution(entry.terminal_attribution, errors);
  if (!Array.isArray(entry.tags) || entry.tags.length === 0 || entry.tags.length > 12) errors.push('tags must contain 1 to 12 values');
  else {
    if (entry.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 40 || /[@\r\n]/u.test(tag))) errors.push('tags contain an invalid value');
    if (new Set(entry.tags).size !== entry.tags.length) errors.push('tags must be unique');
  }
  validateStatusTags(entry.status_tags, errors);
  for (const field of ['reactors_unique', 'comments_count', 'activity_7d']) if (!Number.isInteger(entry[field]) || entry[field] < 0) errors.push(`${field} must be a non-negative integer`);
  if (typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0) errors.push('score must be a non-negative finite number');
  validateReactionList(entry.reactions, 'reactions', errors);
  validateComments(entry, errors);
  validateImages(entry.images, errors);
  for (const { path, value } of collectStrings(entry)) {
    const pattern = sensitivePattern(value);
    if (pattern) errors.push(`${path} contains a forbidden ${pattern} pattern`);
  }
  return [...new Set(errors)];
}

export function validateBugDataset(data) {
  const rootErrors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { accepted: [], rejected: [], blocked: true, rootErrors: ['dataset must be an object'], total: 0, rejectedRatio: 1 };
  const rootKeys = Object.keys(data);
  if (rootKeys.some((key) => !['schema_version', 'generated_at', 'bugs'].includes(key))) rootErrors.push('dataset contains unexpected root fields');
  if (data.schema_version !== 6) rootErrors.push('schema_version must equal 6');
  if (!isDate(data.generated_at)) rootErrors.push('generated_at must be an ISO date-time');
  if (!Array.isArray(data.bugs)) rootErrors.push('bugs must be an array');
  if (rootErrors.length) return { accepted: [], rejected: [], blocked: true, rootErrors, total: 0, rejectedRatio: 1 };
  const seenIds = new Set();
  const accepted = [];
  const rejected = [];
  data.bugs.forEach((entry, index) => {
    const errors = validateBugEntry(entry);
    if (entry && typeof entry.id === 'string' && seenIds.has(entry.id)) errors.push('id must be unique');
    if (entry && typeof entry.id === 'string') seenIds.add(entry.id);
    if (errors.length) rejected.push({ index, id: entry?.id ?? null, errors: [...new Set(errors)] });
    else accepted.push(entry);
  });
  const total = data.bugs.length;
  const rejectedRatio = total === 0 ? 0 : rejected.length / total;
  const blocked = rejected.length > MAX_REJECTED_ENTRIES || rejectedRatio > MAX_REJECTED_RATIO;
  return { accepted, rejected, blocked, rootErrors, total, rejectedRatio };
}

export function sanitizeBugDataset(data) {
  const report = validateBugDataset(data);
  if (report.rootErrors.length || report.blocked) return { data: null, report };
  return { data: { schema_version: data.schema_version, generated_at: data.generated_at, bugs: report.accepted }, report };
}
