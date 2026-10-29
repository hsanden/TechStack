#!/usr/bin/env node
// Bygger den statiska webbplatsen i public/ från data/results.json och data/changes.json.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { CATEGORIES, TECHNOLOGIES } from './technologies.js';

const root = new URL('../', import.meta.url);
const out = new URL('public/', root);
const read = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(p, root), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw e;
  }
};

const results = await read('data/results.json');
const changes = await read('data/changes.json', []);

const technologies = Object.fromEntries(
  Object.entries(TECHNOLOGIES).map(([name, t]) => [name, { category: t.cat, website: t.website }]),
);
const sites = results.sites.map((s) => ({
  domain: s.domain,
  name: s.name,
  category: s.category,
  url: s.url,
  ok: s.ok,
  blocked: s.blocked,
  status: s.status,
  error: s.error,
  scannedAt: s.scannedAt,
  lastAttempt: s.lastAttempt,
  lastError: s.lastError,
  // Tekniker som tagits bort ur signaturdatabasen visas inte
  technologies: s.technologies.filter((t) => technologies[t.name]),
}));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('src/web/', root), out, { recursive: true });
await writeFile(
  new URL('data.json', out),
  JSON.stringify({ scannedAt: results.scannedAt, categories: CATEGORIES, technologies, sites, changes }),
);
console.log(`Byggde public/ med ${sites.length} sajter och ${changes.length} ändringar.`);
