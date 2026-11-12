// Temporary CI helper to transfer npm-generated lockfile into the PR.
import { readFileSync } from 'node:fs';
const data = readFileSync(new URL('../package-lock.json', import.meta.url)).toString('base64');
console.log('CONSPACE_LOCK_START');
for (let i = 0; i < data.length; i += 480) console.log('LOCKCHUNK:' + data.slice(i, i + 480));
console.log('CONSPACE_LOCK_END');
