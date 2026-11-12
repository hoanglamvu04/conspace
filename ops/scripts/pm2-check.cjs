// Read-only PM2 inventory. Never log pm2_env or secrets.
const fs = require('node:fs');

const dumpFile = process.argv[2] || '/root/.pm2/dump.pm2';
const strictAll = process.argv.includes('--strict-all');

function parseJson(label, value) {
  try {
    return JSON.parse(value);
  } catch {
    console.error(`FAIL: ${label} is not valid JSON`);
    process.exit(2);
  }
}

let savedRaw;
try {
  savedRaw = fs.readFileSync(dumpFile, 'utf8');
} catch {
  console.error('FAIL: Cannot read PM2 dump (use the PM2 root account): ' + dumpFile);
  process.exit(2);
}

const saved = parseJson('PM2 dump', savedRaw);
// Some PM2 daemon/CLI version combinations print a >>>> warning before JSON.
const liveOutput = fs.readFileSync(0, 'utf8');
const jsonStart = liveOutput.search(/\[\s*(?:\{|\])/);
if (jsonStart < 0) {
  console.error('FAIL: PM2 live list has no JSON array');
  process.exit(2);
}
const live = parseJson('PM2 live list', liveOutput.slice(jsonStart));
if (!Array.isArray(saved) || !Array.isArray(live)) {
  console.error('FAIL: Unexpected PM2 JSON structure');
  process.exit(2);
}

const nameOf = (app) => app?.name || app?.pm2_env?.name || '';
const savedNames = new Set(saved.map(nameOf).filter(Boolean));
const liveNames = new Set(live.map(nameOf).filter(Boolean));
const missing = [...liveNames].filter((name) => !savedNames.has(name));

console.log('PM2 live process names (sanitized):');
for (const app of live) {
  console.log('  ' + (nameOf(app) || '(unnamed)') + ': ' + (app.pm2_env?.status || 'unknown'));
}
console.log('PM2 saved process names (sanitized): ' + ([...savedNames].join(', ') || '(none)'));

if (!liveNames.has('x-hub-api') || !savedNames.has('x-hub-api')) {
  console.error('FAIL: x-hub-api must exist in BOTH the live PM2 list and the saved dump.');
  process.exitCode = 1;
}
if (missing.length > 0) {
  console.error('WARN: Live processes absent from saved dump: ' + missing.join(', '));
  if (strictAll) process.exitCode = 1;
}
if (!process.exitCode) console.log('PASS: x-hub-api is live and present in PM2 dump' + (strictAll ? '; all live process names are saved.' : '.'));
