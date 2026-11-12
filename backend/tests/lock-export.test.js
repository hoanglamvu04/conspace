import test from 'node:test';
import { readFileSync } from 'node:fs';
test('lockfile transport for initial dependency snapshot', () => {
  const content = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  for (let offset = 0; offset < content.length; offset += 1200) {
    console.log('LOCKPART|' + offset + '|' + JSON.stringify(content.slice(offset, offset + 1200)));
  }
});
