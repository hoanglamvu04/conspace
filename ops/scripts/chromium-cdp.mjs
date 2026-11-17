import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function localBase(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' must be a valid URL'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(label + ' must use a local HTTP loopback origin');
  }
  return url;
}

function findBrowser() {
  const candidates = [
    process.env.CONSPACE_BROWSER_BIN,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome',
  ];
  for (const candidate of candidates.filter(Boolean)) {
    if (isAbsolute(candidate)) { if (existsSync(candidate)) return candidate; continue; }
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Chrome or Chromium not found; set CONSPACE_BROWSER_BIN to its executable');
}

export async function openLocalChrome() {
  const dir = await mkdtemp(join(tmpdir(), 'conspace-chromium-'));
  const chrome = spawn(findBrowser(), [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-gpu', '--disable-background-networking',
    '--disable-dev-shm-usage', '--no-proxy-server',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--user-data-dir=' + dir, '--window-size=1280,900',
    ...(process.env.CI === 'true' ? ['--no-sandbox'] : []),
  ], { stdio: 'ignore' });
  let startupError = null;
  chrome.on('error', (error) => { startupError = error; });
  try {
    let port = null;
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (startupError) throw startupError;
      if (chrome.exitCode !== null) throw new Error('Chromium quit before starting DevTools');
      try {
        const contents = await readFile(join(dir, 'DevToolsActivePort'), 'utf8');
        const value = Number(contents.split(/\r?\n/)[0]);
        if (Number.isInteger(value) && value > 0) { port = value; break; }
      } catch { /* Waiting for Chromium to create its profile */ }
      await sleep(100);
    }
    if (!port) throw new Error('Timed out starting Chromium DevTools');
    return {
      port,
      async close() {
        chrome.kill();
        await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      },
    };
  } catch (error) {
    chrome.kill();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

class DevToolsTab {
  constructor(socket) {
    this.socket = socket;
    this.serial = 0;
    this.pending = new Map();
    this.exceptions = [];
    socket.addEventListener('message', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.id) {
        const waiter = this.pending.get(data.id);
        if (!waiter) return;
        this.pending.delete(data.id);
        clearTimeout(waiter.timer);
        data.error ? waiter.reject(new Error(JSON.stringify(data.error))) : waiter.resolve(data.result);
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params?.exceptionDetails;
        this.exceptions.push(ex?.exception?.description || ex?.text || 'Unknown browser exception');
      }
    });
    socket.addEventListener('close', () => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Browser DevTools connection closed'));
      }
      this.pending.clear();
    });
  }

  call(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Browser command timed out: ' + method));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error('Browser evaluation error: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
    }
    return result.result?.value;
  }

  async waitFor(predicate, description, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.evaluate(predicate)) return;
      await sleep(125);
    }
    const heading = await this.evaluate('document.querySelector("h1")?.textContent || document.body?.textContent?.slice(0,120)');
    throw new Error('Timeout waiting for ' + description + '; rendered: ' + JSON.stringify(heading));
  }

  async visit(frontend, path) {
    this.exceptions = [];
    const result = await this.call('Page.navigate', { url: new URL(path, frontend).href });
    if (result?.errorText) throw new Error('Navigation failed: ' + result.errorText);
    await this.waitFor('document.readyState === "complete" && !!document.querySelector("#main-content")', 'route ' + path);
  }

  async viewport(width, height, mobile = false) {
    await this.call('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile,
    });
    await this.call('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  }

  async key(key) {
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
  }

  async screenshot(path) {
    const result = await this.call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }

  assertNoExceptions(label) {
    if (this.exceptions.length) {
      throw new Error(label + ': uncaught browser JS error: ' + this.exceptions.join(' | ').slice(0, 750));
    }
  }

  close() { this.socket.close(); }
}

export async function openTab(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
  if (!response.ok) throw new Error('Cannot create browser tab: HTTP ' + response.status);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Browser WebSocket failed')), { once: true });
  });
  const tab = new DevToolsTab(socket);
  await tab.call('Page.enable');
  await tab.call('Runtime.enable');
  return tab;
}
