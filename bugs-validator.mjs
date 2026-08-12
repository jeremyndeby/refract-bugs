export const MAX_REJECTED_ENTRIES = 20;
export const MAX_REJECTED_RATIO = 0.05;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const TOKEN_PATTERN = /(?:mfa\.[A-Z0-9_-]{20,}|(?:gh[oprsu]_|sk-|xox[baprs]-)[A-Z0-9_-]{16,}|(?:token|secret|password|authorization)\s*[:=]\s*\S+)/iu;
const ID_PATTERN = /^[0-9]{17,20}$/u;
const LOCAL_IMAGE_PATTERN = /^\.\/assets\/bugs\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/u;

function isDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function collectStrings(value, path = '$', result = []) {
  if (typeof value === 'string') {
    result.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, result));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => collectStrings(entry, `${path}.${key}`, result));
  }
  return result;
}

export function sensitivePattern(value) {
  if (EMAIL_PATTERN.test(value)) return 'email';
  if (TOKEN_PATTERN.test(value)) return 'token';
  return null;
}

export function validateBugEntry(entry) {
  const errors = [];
  const allowedKeys = new Set([
    'id', 'title', 'body', 'posted_at', 'status', 'fixed_at', 'tags',
    'reactors_unique', 'comments_count', 'activity_7d', 'comments', 'images',
  ]);

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return ['entry must be an object'];
  }

  for (const key of Object.keys(entry)) {
    if (!allowedKeys.has(key)) errors.push(`unexpected field: ${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in entry)) errors.push(`missing field: ${key}`);
  }

  if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) errors.push('id must contain 17 to 20 digits');
  if (typeof entry.title !== 'string' || entry.title.trim().length === 0 || entry.title.length > 4000) errors.push('title must be non-empty public text');
  if (typeof entry.body !== 'string' || entry.body.trim().length === 0 || entry.body.length > 4000) errors.push('body must be non-empty public text');
  if (!isDate(entry.posted_at)) errors.push('posted_at must be an ISO date-time');
  if (!['open', 'fixed'].includes(entry.status)) errors.push('status must be open or fixed');
  if (entry.status === 'open' && entry.fixed_at !== null) errors.push('open bugs must have fixed_at set to null');
  if (entry.status === 'fixed' && !isDate(entry.fixed_at)) errors.push('fixed bugs must have a fixed_at date-time');
  if (isDate(entry.posted_at) && isDate(entry.fixed_at) && Date.parse(entry.fixed_at) < Date.parse(entry.posted_at)) errors.push('fixed_at cannot precede posted_at');

  if (!Array.isArray(entry.tags) || entry.tags.length === 0 || entry.tags.length > 12) {
    errors.push('tags must contain 1 to 12 values');
  } else {
    if (entry.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 40 || /[@\r\n]/u.test(tag))) errors.push('tags contain an invalid value');
    if (new Set(entry.tags).size !== entry.tags.length) errors.push('tags must be unique');
  }

  for (const field of ['reactors_unique', 'comments_count', 'activity_7d']) {
    if (!Number.isInteger(entry[field]) || entry[field] < 0) errors.push(`${field} must be a non-negative integer`);
  }

  if (!Array.isArray(entry.comments)) {
    errors.push('comments must be an array');
  } else {
    entry.comments.forEach((comment, index) => {
      const prefix = `comments[${index}]`;
      if (!comment || typeof comment !== 'object' || Array.isArray(comment)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      const keys = Object.keys(comment);
      if (keys.length !== 3 || !keys.includes('text') || !keys.includes('date') || !keys.includes('is_team')) errors.push(`${prefix} has an invalid shape`);
      if (typeof comment.text !== 'string' || !comment.text.trim() || comment.text.length > 4000) errors.push(`${prefix}.text must be non-empty public text`);
      if (!isDate(comment.date)) errors.push(`${prefix}.date must be an ISO date-time`);
      if (typeof comment.is_team !== 'boolean') errors.push(`${prefix}.is_team must be boolean`);
    });
    if (Number.isInteger(entry.comments_count) && entry.comments_count !== entry.comments.length) errors.push('comments_count must equal comments.length');
  }

  if (!Array.isArray(entry.images) || entry.images.length > 12) {
    errors.push('images must be an array with at most 12 values');
  } else {
    if (entry.images.some((url) => typeof url !== 'string' || !LOCAL_IMAGE_PATTERN.test(url))) errors.push('images must use local repository URLs');
    if (new Set(entry.images).size !== entry.images.length) errors.push('images must be unique');
  }

  for (const { path, value } of collectStrings(entry)) {
    const pattern = sensitivePattern(value);
    if (pattern) errors.push(`${path} contains a forbidden ${pattern} pattern`);
  }

  return [...new Set(errors)];
}

export function validateBugDataset(data) {
  const rootErrors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { accepted: [], rejected: [], blocked: true, rootErrors: ['dataset must be an object'], total: 0, rejectedRatio: 1 };
  }
  const rootKeys = Object.keys(data);
  if (rootKeys.some((key) => !['schema_version', 'generated_at', 'bugs'].includes(key))) rootErrors.push('dataset contains unexpected root fields');
  if (data.schema_version !== 1) rootErrors.push('schema_version must equal 1');
  if (!isDate(data.generated_at)) rootErrors.push('generated_at must be an ISO date-time');
  if (!Array.isArray(data.bugs)) rootErrors.push('bugs must be an array');
  if (rootErrors.length) {
    return { accepted: [], rejected: [], blocked: true, rootErrors, total: 0, rejectedRatio: 1 };
  }

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
