// Detekteringsmotor: tar en "sida" (HTML, headers, cookies, URL:er, JS-globaler)
// och returnerar vilka tekniker som hittades, med bevis för varje träff.

import { TECHNOLOGIES, CATEGORIES } from './technologies.js';

const MAX_EVIDENCE = 3;

/**
 * @param {object} page
 * @param {string} page.html             Sidans HTML
 * @param {Record<string,string>} page.headers  Svarshuvuden (namn i gemener)
 * @param {string[]} page.cookies        Cookienamn
 * @param {string[]} page.urls           Resurs-URL:er
 * @param {string[]} [page.jsGlobals]    Globala variabler som finns på sidan
 * @param {object} [technologies]
 */
export function detect(page, technologies = TECHNOLOGIES) {
  const html = page.html || '';
  const headers = page.headers || {};
  const cookies = page.cookies || [];
  const urls = page.urls || [];
  const jsGlobals = new Set(page.jsGlobals || []);
  const meta = extractMeta(html);

  const found = new Map();
  const add = (name, evidence) => {
    if (!found.has(name)) found.set(name, []);
    const ev = found.get(name);
    if (ev.length < MAX_EVIDENCE && !ev.includes(evidence)) ev.push(evidence);
  };

  for (const [name, t] of Object.entries(technologies)) {
    for (const re of t.urls || []) {
      const hit = urls.find((u) => re.test(u));
      if (hit) add(name, `url: ${truncate(hit)}`);
    }
    for (const re of t.html || []) {
      const m = html.match(re);
      if (m) add(name, `html: …${truncate(context(html, m.index, m[0].length), 80)}…`);
    }
    for (const [h, re] of Object.entries(t.headers || {})) {
      if (headers[h] !== undefined && re.test(headers[h])) add(name, `header: ${h}: ${truncate(headers[h], 60)}`);
    }
    for (const re of t.cookies || []) {
      const hit = cookies.find((c) => re.test(c));
      if (hit) add(name, `cookie: ${hit}`);
    }
    for (const [m, re] of Object.entries(t.meta || {})) {
      if (meta[m] && re.test(meta[m])) add(name, `meta ${m}: ${truncate(meta[m], 60)}`);
    }
    for (const g of t.js || []) {
      if (jsGlobals.has(g)) add(name, `js: ${g}`);
    }
  }

  // Följdtekniker (t.ex. WooCommerce => WordPress)
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...found.keys()]) {
      for (const implied of technologies[name]?.implies || []) {
        if (!found.has(implied)) {
          found.set(implied, [`följer av ${name}`]);
          changed = true;
        }
      }
    }
  }

  return [...found.entries()]
    .map(([name, evidence]) => ({ name, category: technologies[name].cat, evidence }))
    .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.name.localeCompare(b.name, 'sv'));
}

/** Alla JS-sökvägar som någon signatur vill kontrollera (används av webbläsarskannern). */
export function jsPaths(technologies = TECHNOLOGIES) {
  return [...new Set(Object.values(technologies).flatMap((t) => t.js || []))];
}

/** Plockar ut resurs-URL:er ur HTML när vi inte har en webbläsare. */
export function extractUrls(html, baseUrl) {
  const out = new Set();
  const re = /\b(?:src|href|data-src|action)\s*=\s*["']([^"'\s>]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.add(new URL(m[1].replace(/&amp;/g, '&'), baseUrl).href);
    } catch {
      // ogiltig URL – hoppa över
    }
  }
  return [...out];
}

export function extractMeta(html) {
  const meta = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name && content !== undefined && !(name in meta)) meta[name] = content;
  }
  return meta;
}

/** Känner igen sidor från botskydd (Cloudflare, Akamai, Imperva m.fl.). */
export function isChallengePage(status, html) {
  if (![403, 429, 503].includes(status)) return false;
  return /Just a moment\.\.\.|cf-chl-|challenge-platform|_Incapsula_Resource|Access Denied|Pardon Our Interruption|captcha/i.test(html || '');
}

const ORDER = Object.keys(CATEGORIES);
function categoryOrder(cat) {
  const i = ORDER.indexOf(cat);
  return i === -1 ? ORDER.length : i;
}

function truncate(s, n = 100) {
  s = String(s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function context(s, index, len) {
  const start = Math.max(0, index - 20);
  return s.slice(start, index + len + 20);
}
