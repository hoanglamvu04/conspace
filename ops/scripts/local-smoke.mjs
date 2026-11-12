#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

export function assertLoopbackUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' must be a valid URL'); }
  const allowed = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (url.protocol !== 'http:' || !allowed.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error(label + ' must target local HTTP loopback only; production/VPS is forbidden');
  }
  return url;
}

export function localUrl(base, pathname) {
  return new URL(pathname, base).toString();
}

async function expect(fetcher, url, statuses, label) {
  let response;
  try {
    response = await fetcher(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(label + ': cannot connect; start the local service first');
  }
  if (!statuses.includes(response.status)) {
    throw new Error(label + ': expected HTTP ' + statuses.join('/') + ', received ' + response.status);
  }
  return response;
}

async function json(fetcher, url, label, statuses = [200]) {
  const response = await expect(fetcher, url, statuses, label);
  let body;
  try { body = await response.json(); } catch { throw new Error(label + ': response is not JSON'); }
  if (!body || body.ok !== true) throw new Error(label + ': API did not return ok:true');
  return body;
}

export async function runLocalSmoke({ fetcher = fetch, env = process.env, log = console.log } = {}) {
  const frontend = assertLoopbackUrl(env.CONSPACE_FRONTEND_URL || 'http://127.0.0.1:5176', 'CONSPACE_FRONTEND_URL');
  const backend = assertLoopbackUrl(env.CONSPACE_API_URL || 'http://127.0.0.1:5088', 'CONSPACE_API_URL');
  const pass = (name) => log('PASS: ' + name);

  await expect(fetcher, localUrl(frontend, '/'), [200], 'Frontend home');
  pass('Frontend home');
  await expect(fetcher, localUrl(frontend, '/admin/login'), [200], 'CMS login route');
  pass('CMS login route');

  const health = await json(fetcher, localUrl(backend, '/api/health'), 'Backend health');
  if (health.service !== 'conspace-api') throw new Error('Backend health: unexpected service identifier');
  pass('Backend health');

  const ready = await json(fetcher, localUrl(backend, '/api/ready'), 'Database readiness');
  if (ready.checks?.database !== 'up') throw new Error('Database readiness: PostgreSQL is not ready');
  pass('PostgreSQL readiness');

  await expect(fetcher, localUrl(backend, '/api/admin/auth/session'), [401], 'Anonymous CMS session');
  pass('Anonymous CMS session is denied');
  await expect(fetcher, localUrl(backend, '/api/admin/users'), [401], 'Anonymous CMS users API');
  pass('Anonymous CMS users API is denied');

  const niches = await json(fetcher, localUrl(backend, '/api/v1/niches'), 'Public niches');
  if (!Array.isArray(niches.data)) throw new Error('Public niches: expected an array');
  pass('Public niches API');

  for (const role of ['homeowner', 'architect', 'contractor']) {
    const feed = await json(fetcher, localUrl(backend, '/api/v1/feed?role=' + role + '&limit=6'), 'Feed ' + role);
    for (const key of ['books', 'articles', 'fieldNotes', 'questions']) {
      if (!Array.isArray(feed.data?.[key])) throw new Error('Feed ' + role + ': invalid ' + key + ' collection');
    }
    if (feed.meta?.preferredAudienceRole !== role) throw new Error('Feed ' + role + ': lens preference not acknowledged');
    pass('Public feed lens ' + role + ' (all content collections remain available)');
  }

  const notes = await json(fetcher, localUrl(backend, '/api/v1/field-notes?role=architect&limit=5'), 'Field notes lens');
  if (!Array.isArray(notes.data)) throw new Error('Field notes lens: expected an array');
  pass('Field notes lens preference');

  const search = await json(fetcher, localUrl(backend, '/api/v1/search?q=conspace&role=architect&limit=5'), 'Public search');
  if (!Array.isArray(search.data)) throw new Error('Public search: expected an array');
  pass('Public search');

  const first = niches.data[0];
  if (first?.slug) {
    const detail = await json(fetcher, localUrl(backend, '/api/v1/niches/' + encodeURIComponent(first.slug) + '?role=architect'), 'Niche detail');
    if (!Array.isArray(detail.data?.sections)) throw new Error('Niche detail: missing sections');
    for (const section of detail.data.sections) {
      if (section.content && !section.sourceRef) throw new Error('Niche detail: public section without a source');
      if (section.sharedContent && !section.sharedSourceRef) throw new Error('Niche detail: shared public content without a source');
      for (const layer of section.layers || []) {
        if (layer.content && !layer.sourceRef) throw new Error('Niche detail: public reader layer without a source');
      }
    }
    pass('Niche detail exposes only source-backed published sections');
  } else {
    log('INFO: no active niche rows; detail test skipped');
  }

  log('PASS: CONSPACE local smoke completed. No credentials used; no data was modified.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runLocalSmoke().catch((error) => {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  });
}
