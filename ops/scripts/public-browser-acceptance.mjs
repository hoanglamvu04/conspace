#!/usr/bin/env node
// Read-only Chromium acceptance: real React DOM, desktop/mobile input, no CMS login.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { localBase, openLocalChrome, openTab } from './chromium-cdp.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function localGet(base, path) {
  let response;
  try {
    response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error('Cannot reach local service: ' + new URL(path, base));
  }
  if (response.status !== 200) throw new Error(path + ': expected HTTP 200, received ' + response.status);
  return response;
}

export async function runPublicBrowserAcceptance({ env = process.env, log = console.log } = {}) {
  const frontend = localBase(env.CONSPACE_FRONTEND_URL || 'http://127.0.0.1:5176/', 'CONSPACE_FRONTEND_URL');
  const backend = localBase(env.CONSPACE_API_URL || 'http://127.0.0.1:5088/', 'CONSPACE_API_URL');

  await localGet(frontend, '/');
  const ready = await (await localGet(backend, '/api/ready')).json();
  assert.equal(ready.checks?.database, 'up', 'Local PostgreSQL must be ready');
  const seeded = await (await localGet(backend, '/api/v1/articles/demo-public-design-overview')).json();
  assert.equal(seeded.data?.slug, 'demo-public-design-overview', 'Run local demo seed first');
  const niche = env.DEMO_NICHE_SLUG || 'house';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(niche)) throw new Error('DEMO_NICHE_SLUG must be a safe active design slug');
  const designTitle = JSON.stringify(niche.toUpperCase());

  const chrome = await openLocalChrome();
  const artifacts = env.CONSPACE_BROWSER_ARTIFACTS || join(tmpdir(), 'conspace-browser-artifacts');
  await mkdir(artifacts, { recursive: true });
  let tab;
  let current = 'starting browser';

  async function step(label, fn) {
    current = label;
    await fn();
    tab.assertNoExceptions(label);
    log('PASS: ' + label);
  }

  try {
    tab = await openTab(chrome.port);
    await tab.viewport(1280, 900);

    await step('Desktop homepage renders React heading and navigation', async () => {
      await tab.visit(frontend, '/');
      await tab.waitFor('!!document.querySelector(".editorial-home .ed-hero h1") && !!document.querySelector(".ed-niche-section")', 'editorial homepage layout');
      assert.equal(await tab.evaluate('getComputedStyle(document.querySelector(".desktop-nav")).display !== "none"'), true);
      assert.equal(await tab.evaluate(`document.querySelectorAll('.desktop-nav a[href="/bai-viet"]').length`), 1, 'Article link must appear in desktop header');
      await tab.waitFor('!!document.querySelector(".ed-articles-heading h2")', 'Vietnamese editorial headline');
      assert.equal(await tab.evaluate('getComputedStyle(document.querySelector(".ed-articles-heading h2")).fontFamily.includes("Noto Serif")'), true, 'Editorial headings must use Vietnamese-capable serif');
      assert.equal(await tab.evaluate('getComputedStyle(document.querySelector(".ed-articles-heading h2")).letterSpacing'), 'normal', 'Do not compress accented Vietnamese headings');
    });

    await step('Published article loads and unapproved article stays hidden', async () => {
      await tab.visit(frontend, '/bai-viet/demo-public-design-overview');
      await tab.waitFor('document.querySelector("h1")?.textContent.includes("[DEMO]") && document.querySelector(".article-content")?.textContent.includes("Nội dung công khai")', 'published article body');
      await tab.visit(frontend, '/bai-viet/demo-review-needs-changes');
      await tab.waitFor('document.querySelector(".state-panel")?.textContent.includes("Bài viết không tồn tại")', 'unpublished article denial');
      assert.equal(await tab.evaluate('!!document.querySelector(".article-content")'), false);
    });

    await step('Architecture Template B and Dictionary detail render published data', async () => {
      await tab.visit(frontend, '/mang/' + niche);
      await tab.waitFor('document.querySelector("h1")?.textContent.includes(' + designTitle + ') && !!document.querySelector(".public-design-grid")', 'Template B design grid');
      await tab.visit(frontend, '/tu-dien/demo-thuat-ngu-cong-khai');
      await tab.waitFor('!!document.querySelector(".public-term-definition")', 'published Dictionary definition');
    });

    await step('Quick Search results and article filter work in browser', async () => {
      await tab.visit(frontend, '/tra-nhanh?q=demo');
      await tab.waitFor('!!document.querySelector(".public-search-results")', 'published search results');
      const found = await tab.evaluate('(() => { const button = [...document.querySelectorAll(".lookup-facets button")].find(x => x.textContent.includes("Bài viết")); if (!button) return false; button.click(); return true; })()');
      assert.equal(found, true, 'Article filter must exist');
      await tab.waitFor('new URLSearchParams(location.search).get("type") === "article"', 'article filter navigation');
    });

    await step('Q&A form only exposes private phone after explicit opt-in', async () => {
      await tab.visit(frontend, '/hoi-dap/gui-cau-hoi');
      await tab.waitFor('!!document.querySelector("#question-description")', 'Q&A form');
      assert.equal(await tab.evaluate('document.querySelector("form.public-question-form").checkValidity()'), false);
      assert.equal(await tab.evaluate('!!document.querySelector("#question-phone")'), false);
      await tab.evaluate('document.querySelector(".public-consent-check input").click()');
      await tab.waitFor('!!document.querySelector("#question-phone")', 'private contact opt-in');
      await tab.evaluate('document.querySelector(".public-consent-check input").click()');
      await tab.waitFor('!document.querySelector("#question-phone")', 'private contact opt-out');
    });

    await tab.viewport(390, 844, true);

    await step('Mobile menu manages background, Escape and focus restoration', async () => {
      await tab.visit(frontend, '/');
      await tab.waitFor('!!document.querySelector(".editorial-home .ed-hero h1")', 'mobile editorial homepage');
      assert.equal(await tab.evaluate('getComputedStyle(document.querySelector(".mobile-menu-button")).display !== "none"'), true);
      await tab.evaluate('document.querySelector(".mobile-menu-button").click()');
      await tab.waitFor('!!document.querySelector(".mobile-nav") && document.body.classList.contains("public-menu-open")', 'open mobile menu');
      assert.equal(await tab.evaluate(`document.querySelectorAll('.mobile-nav-primary a[href="/bai-viet"]').length`), 1, 'Article link must appear once in primary mobile navigation');
      assert.equal(await tab.evaluate('document.querySelector("#main-content").inert'), true);
      await tab.key('Escape');
      await tab.waitFor('!document.querySelector(".mobile-nav") && !document.querySelector("#main-content").inert', 'Escape closes menu');
      assert.equal(await tab.evaluate('document.activeElement === document.querySelector(".mobile-menu-button")'), true);
    });

    await step('Mobile reader switch closes menu and persists role preference', async () => {
      await tab.evaluate('document.querySelector(".mobile-menu-button").click()');
      await tab.waitFor('!!document.querySelector(".mobile-nav-reader .reader-option")', 'reader choices');
      await tab.evaluate('document.querySelectorAll(".mobile-nav-reader .reader-option")[1].click()');
      await tab.waitFor('!document.querySelector(".mobile-nav") && document.cookie.includes("conspace_reader=architect")', 'saved reader lens');
      assert.equal(await tab.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), true, 'Horizontal overflow on mobile homepage');
    });

    await step('Mobile Search and Q&A pages have no horizontal overflow', async () => {
      for (const path of ['/tra-nhanh?q=demo', '/hoi-dap', '/hoi-dap/gui-cau-hoi']) {
        await tab.visit(frontend, path);
        await tab.waitFor('!!document.querySelector("main") && !!document.querySelector("h1")', 'mobile route ' + path);
        await pause(300);
        assert.equal(await tab.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), true, 'Mobile overflow on ' + path);
      }
    });

    log('PASS: CONSPACE Chromium desktop/mobile browser acceptance completed');
  } catch (error) {
    if (tab) {
      const screenshot = join(artifacts, 'public-browser-failure.png');
      try { await tab.screenshot(screenshot); log('Browser failure screenshot: ' + screenshot); }
      catch { /* Keep the original failure */ }
    }
    throw new Error(current + ': ' + error.message);
  } finally {
    tab?.close();
    await chrome.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPublicBrowserAcceptance().catch((error) => {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  });
}
