// Hämtar en sajt och samlar det som detekteringen behöver.
// Webbläsarläget (Playwright) ger bäst resultat: JS-renderade sajter, taggar som
// laddas via Tag Manager och nätverksanrop efter att cookiebannern godkänts.
// HTTP-läget är en snabb reserv som bara ser serverns HTML.

import { createRequire } from 'node:module';
import { extractUrls, jsPaths } from './detect.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HEADERS = { 'user-agent': UA, 'accept-language': 'sv-SE,sv;q=0.9,en;q=0.8', accept: 'text/html,*/*;q=0.8' };

// Knappar för att godkänna cookies, så att marknadsföringstaggar laddas.
const CONSENT_SELECTORS = [
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#onetrust-accept-btn-handler',
  '.coi-banner__accept',
  '#coiPage-1 .coi-banner__accept',
  '#didomi-notice-agree-button',
  '[data-testid="uc-accept-all-button"]',
  '.cky-btn-accept',
  '#cmplz-accept, .cmplz-accept',
];
const CONSENT_TEXT = /^(acceptera|godkänn|tillåt|jag godkänner|ok, jag förstår|accept)( alla)?( cookies| kakor)?$/i;

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      // Global installation (t.ex. i utvecklingsmiljöer med NODE_PATH)
      return createRequire(import.meta.url)('playwright');
    } catch {
      return null;
    }
  }
}

export async function fetchHttp(url, { timeout = 20000 } = {}) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  const html = await res.text();
  const headers = Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  const cookies = (res.headers.getSetCookie?.() || []).map((c) => c.split('=')[0].trim());
  return {
    mode: 'http',
    status: res.status,
    finalUrl: res.url,
    html,
    headers,
    cookies,
    urls: extractUrls(html, res.url),
    jsGlobals: [],
  };
}

export async function createBrowser(playwright) {
  const browser = await playwright.chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const paths = jsPaths();

  async function fetchBrowser(url, { timeout = 45000, settle = 3000 } = {}) {
    const context = await browser.newContext({
      userAgent: UA,
      locale: 'sv-SE',
      viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { 'accept-language': HEADERS['accept-language'] },
    });
    const page = await context.newPage();
    const urls = new Set();
    page.on('request', (r) => urls.add(r.url()));
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      const rawHtml = res ? await res.text().catch(() => '') : '';
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await acceptConsent(page);
      await page.waitForTimeout(settle);
      await page.mouse.wheel(0, 2500).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

      const rendered = await page.content().catch(() => '');
      const jsGlobals = await page
        .evaluate((list) => {
          const has = (path) => {
            try {
              let o = window;
              for (const k of path.split('.')) {
                if (o == null || !(k in Object(o))) return false;
                o = o[k];
              }
              return o !== undefined && o !== null;
            } catch {
              return false;
            }
          };
          return list.filter(has);
        }, paths)
        .catch(() => []);
      const cookies = (await context.cookies()).map((c) => c.name);
      const headers = res ? await res.allHeaders() : {};
      return {
        mode: 'browser',
        status: res?.status() ?? 0,
        finalUrl: page.url(),
        // Både rå och renderad HTML: vissa spår finns bara i den ena.
        html: rawHtml + '\n<!-- rendered -->\n' + rendered,
        title: await page.title().catch(() => ''),
        headers,
        cookies,
        urls: [...urls, ...extractUrls(rendered, page.url())],
        jsGlobals,
      };
    } finally {
      await context.close().catch(() => {});
    }
  }

  return { fetch: fetchBrowser, close: () => browser.close() };
}

async function acceptConsent(page) {
  for (const sel of CONSENT_SELECTORS) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  const buttons = page.locator('button, a[role="button"], [role="button"]');
  const n = Math.min(await buttons.count().catch(() => 0), 60);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const text = ((await b.innerText({ timeout: 300 }).catch(() => '')) || '').trim();
    if (CONSENT_TEXT.test(text) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}
