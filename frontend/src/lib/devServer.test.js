import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../../', import.meta.url));
const viteBin = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));

test('Vite localhost serves every IA v1.0 public route through the SPA entry point', { timeout: 20000 }, async (t) => {
  const port = 5177;
  const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: frontendRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!server.killed) server.kill('SIGTERM'); });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Vite exited before ready: ' + stderr);
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/');
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'Vite dev server did not become ready: ' + stderr);

  const routes = [
    '/', '/tu-sach', '/ngach', '/mang/sample-area', '/hien-truong',
    '/hoi-dap', '/hoi-dap/gui-cau-hoi', '/tra-nhanh', '/tra-cuu',
    '/tu-dien', '/ban-nghe', '/lien-he',
    '/cam-nang/phan-1/muc-1', '/phan-nha-thau/chuong-1', '/quan-quanh-kts/chuong-1',
  ];
  for (const route of routes) {
    const response = await fetch('http://127.0.0.1:' + port + route);
    assert.equal(response.status, 200, route + ' should resolve through the SPA');
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.match(html, /id="root"/);
    assert.match(html, /src="\/src\/main\.jsx"/);
  }
});
