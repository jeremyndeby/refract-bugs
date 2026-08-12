import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBugDataset } from './bugs-validator.mjs';

const filename = resolve(process.argv[2] ?? 'bugs.json');
const data = JSON.parse(await readFile(filename, 'utf8'));
const result = validateBugDataset(data);

for (const rejection of result.rejected) {
  console.error(`REJECT index=${rejection.index} id=${rejection.id ?? 'unknown'}: ${rejection.errors.join('; ')}`);
}
for (const error of result.rootErrors) console.error(`ROOT: ${error}`);

console.log(JSON.stringify({
  total: result.total,
  accepted: result.accepted.length,
  rejected: result.rejected.length,
  rejected_ratio: Number(result.rejectedRatio.toFixed(6)),
  blocked: result.blocked,
}));

if (result.rootErrors.length || result.blocked) process.exitCode = 1;
