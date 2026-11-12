// Temporary integration helper: print the generated lockfile from CI for deterministic npm ci.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const zipped = gzipSync(readFileSync(new URL('../package-lock.json', import.meta.url)));
const data = zipped.toString('base64');
console.log('CONSPACE_LOCK_START');
for (let i = 0; i < data.length; i += 480) console.log('LOCKCHUNK:' + data.slice(i, i + 480));
console.log('CONSPACE_LOCK_END');
