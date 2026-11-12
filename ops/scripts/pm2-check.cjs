// Read-only PM2 inventory. Never print pm2_env, environment variables or secrets.
const fs = require('node:fs');
const dumpFile = process.argv[2] || '/root/.pm2/dump.pm2';
const strictAll = process.argv.includes('--strict-all');
const requireOnline = process.argv.includes('--require-online');
function fail(message, code = 1) { console.error('FAIL: ' + message); process.exit(code); }
function parseJson(label, value) {
  try { return JSON.parse(value); } catch { fail(label + ' is not valid JSON', 2); }
}
let saved;
try { saved = parseJson('PM2 dump', fs.readFileSync(dumpFile, 'utf8')); }
catch { fail('Cannot read PM2 dump (run as the existing PM2 owner)', 2); }
const liveOutput = fs.readFileSync(0, 'utf8');
const jsonStart = liveOutput.search(/\[\s*(?:\{|\])/);
if (jsonStart < 0) fail('PM2 live list has no JSON array', 2);
const live = parseJson('PM2 live list', liveOutput.slice(jsonStart));
if (!Array.isArray(saved) || !Array.isArray(live)) fail('Unexpected PM2 JSON structure', 2);
const nameOf = (app) => app?.name || app?.pm2_env?.name || '';
const savedNames = new Set(saved.map(nameOf).filter(Boolean));
const liveNames = new Set(live.map(nameOf).filter(Boolean));
const missing = [...liveNames].filter((name) => !savedNames.has(name));
const offline = live.filter((app) => app?.pm2_env?.status !== 'online').map(nameOf);
console.log('PM2 live processes (names/status only):');
for (const app of live) console.log('  ' + (nameOf(app) || '(unnamed)') + ': ' + (app.pm2_env?.status || 'unknown'));
console.log('Saved process names: ' + ([...savedNames].join(', ') || '(none)'));
if (!liveNames.has('x-hub-api') || !savedNames.has('x-hub-api')) fail('x-hub-api must exist in BOTH the live PM2 list and /root/.pm2/dump.pm2.');
if (missing.length) {
  console.error('Live processes absent from saved dump: ' + missing.join(', '));
  if (strictAll) process.exitCode = 1;
}
if (requireOnline && offline.length) {
  console.error('Processes not online; stop and investigate before deployment: ' + offline.join(', '));
  process.exitCode = 1;
}
if (!process.exitCode) console.log('PASS: x-hub-api is live and saved' + (strictAll ? '; all live process names are saved' : '') + (requireOnline ? '; all live processes are online' : '') + '.');
