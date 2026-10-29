#!/usr/bin/env node
// Skannar sajterna i data/sites.json och skriver data/results.json och data/changes.json.
//
//   node src/scan.js                       # alla sajter, webbläsarläge om Playwright finns
//   node src/scan.js --mode=http           # bara HTTP (snabbt, sämre träffbild)
//   node src/scan.js --only=ellos.se,cdon.se
//   node src/scan.js --concurrency=6 --limit=20
//   node src/scan.js --only=ellos.se --dump    # sparar rådata i .cache/dump/ för felsökning
//   node src/scan.js --from-dump               # kör om detekteringen på sparad rådata, utan nätverk

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { detect, isChallengePage } from './detect.js';
import { fetchHttp, createBrowser, loadPlaywright } from './fetch.js';
import { TECHNOLOGIES } from './technologies.js';

const DATA = new URL('../data/', import.meta.url);
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

// Kategorier vars ändringar är för brusiga för ändringsloggen.
const NOISY = new Set(['hosting', 'server', 'shipping', 'frontend']);
const MAX_CHANGES = 2000;

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(new URL(name, DATA), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function main() {
  const sites = await readJson('sites.json', []);
  const overrides = await readJson('overrides.json', {});
  const previous = await readJson('results.json', { sites: [] });
  const changes = await readJson('changes.json', []);
  const prevByDomain = new Map(previous.sites.map((s) => [s.domain, s]));

  let todo = sites;
  if (args.only) {
    const only = new Set(String(args.only).split(','));
    todo = sites.filter((s) => only.has(s.domain));
  }
  if (args.limit) todo = todo.slice(0, Number(args.limit));

  let browser = null;
  if (args['from-dump']) {
    const { readdir } = await import('node:fs/promises');
    const dumped = new Set((await readdir(new URL('../.cache/dump/', import.meta.url))).map((f) => f.replace(/\.json$/, '')));
    todo = todo.filter((s) => dumped.has(s.domain));
  } else if (args.mode !== 'http') {
    const pw = await loadPlaywright();
    if (pw) browser = await createBrowser(pw);
    else console.warn('Playwright saknas – kör i HTTP-läge. Installera med: npm install && npx playwright install chromium');
  }

  const concurrency = Number(args.concurrency || (browser ? 4 : 8));
  const results = new Map();
  let done = 0;
  const queue = [...todo];

  async function worker() {
    while (queue.length) {
      const site = queue.shift();
      const result = await scanSite(site, browser, overrides[site.domain]);
      results.set(site.domain, result);
      done++;
      const platform = result.technologies.filter((t) => t.category === 'platform').map((t) => t.name).join(', ') || '–';
      const cms = result.technologies.filter((t) => t.category === 'cms').map((t) => t.name).join(', ') || '–';
      const flag = result.error ? `FEL: ${result.error}` : result.blocked ? `BLOCKERAD (${result.status})` : result.status;
      console.log(`[${done}/${todo.length}] ${site.domain.padEnd(26)} ${String(flag).padEnd(14)} plattform: ${platform.padEnd(22)} cms: ${cms}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  await browser?.close();

  const now = new Date().toISOString();
  const out = [];
  for (const site of sites) {
    const fresh = results.get(site.domain);
    const prev = prevByDomain.get(site.domain);
    if (!fresh) {
      if (prev) out.push({ ...prev, ...siteInfo(site) });
      continue;
    }
    // Om sajten blockerade oss: behåll förra lyckade resultatet hellre än att tappa allt.
    if (!fresh.ok && prev?.ok) {
      out.push({ ...prev, ...siteInfo(site), lastAttempt: now, lastError: fresh.error || `status ${fresh.status}` });
      continue;
    }
    if (fresh.ok && prev?.ok && !args['from-dump']) {
      const diff = diffTech(prev.technologies, fresh.technologies);
      if (diff.added.length || diff.removed.length) changes.push({ date: now, domain: site.domain, ...diff });
    }
    out.push({ ...fresh, firstSeen: prev?.firstSeen || now });
  }

  const technologies = Object.fromEntries(
    Object.entries(TECHNOLOGIES).map(([name, t]) => [name, { category: t.cat, website: t.website }]),
  );
  await writeFile(new URL('results.json', DATA), JSON.stringify({ scannedAt: now, technologies, sites: out }, null, 1) + '\n');
  await writeFile(new URL('changes.json', DATA), JSON.stringify(changes.slice(-MAX_CHANGES), null, 1) + '\n');

  const ok = [...results.values()].filter((r) => r.ok).length;
  console.log(`\nKlart: ${ok}/${results.size} sajter skannade utan blockering. Resultat i data/results.json`);
}

function siteInfo(site) {
  return { domain: site.domain, name: site.name, category: site.category, url: site.url || `https://www.${site.domain}/` };
}

async function scanSite(site, browser, override) {
  const info = siteInfo(site);
  const base = { ...info, scannedAt: new Date().toISOString() };
  let page = null;
  let error = null;

  const dumpFile = new URL(`../.cache/dump/${site.domain}.json`, import.meta.url);
  let attempts = browser ? [() => browser.fetch(info.url), () => fetchHttp(info.url)] : [() => fetchHttp(info.url)];
  if (args['from-dump']) attempts = [async () => JSON.parse(await readFile(dumpFile, 'utf8'))];
  for (const attempt of attempts) {
    try {
      const p = await attempt();
      if (!page || (isBlocked(page) && !isBlocked(p))) page = p;
      if (!isBlocked(p)) break;
    } catch (e) {
      error = e.cause?.code || e.message.split('\n')[0];
    }
  }

  if (page && args.dump && !args['from-dump']) {
    await mkdir(new URL('.', dumpFile), { recursive: true });
    await writeFile(dumpFile, JSON.stringify(page));
  }

  let technologies = page ? detect(page) : [];
  const blocked = page ? isBlocked(page) : false;
  if (override) technologies = applyOverride(technologies, override);

  return {
    ...base,
    ok: !!page && !blocked && page.status < 400,
    status: page?.status ?? 0,
    blocked,
    mode: page?.mode ?? null,
    finalUrl: page?.finalUrl ?? null,
    title: page?.title || titleOf(page?.html),
    error: page ? null : error,
    technologies,
  };
}

function isBlocked(p) {
  return isChallengePage(p.status, p.html) || p.status === 403 || p.status === 429;
}

function applyOverride(technologies, override) {
  const list = technologies.filter((t) => !(override.remove || []).includes(t.name));
  for (const name of override.add || []) {
    if (!TECHNOLOGIES[name]) throw new Error(`Okänd teknik i overrides.json: ${name}`);
    const existing = list.find((t) => t.name === name);
    const evidence = `manuellt angiven${override.source ? ` (${override.source})` : ''}`;
    if (existing) existing.evidence.push(evidence);
    else list.push({ name, category: TECHNOLOGIES[name].cat, evidence: [evidence], manual: true });
  }
  return list;
}

function diffTech(before, after) {
  const names = (list) => new Set(list.filter((t) => !NOISY.has(t.category)).map((t) => t.name));
  const a = names(before);
  const b = names(after);
  return { added: [...b].filter((n) => !a.has(n)), removed: [...a].filter((n) => !b.has(n)) };
}

function titleOf(html) {
  return (/<title[^>]*>([^<]*)<\/title>/i.exec(html || '')?.[1] || '').trim().slice(0, 200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
