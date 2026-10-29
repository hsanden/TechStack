// Klientapp: läser data.json och renderar vyerna via hash-routing.
//   #/                     sajtlista med filter (har/har inte, bransch, plattform)
//   #/sajt/<domän>         en sajts tekniska uppsättning
//   #/teknik/<namn>        alla sajter med en viss teknik
//   #/tekniker             alla tekniker per kategori
//   #/andringar            teknikändringar mellan skanningar
//   #/om

const app = document.getElementById('app');
const data = await fetch('data.json').then((r) => r.json());
const { categories, technologies, changes } = data;
const sites = data.sites.map((s) => ({ ...s, techSet: new Set(s.technologies.map((t) => t.name)) }));
const scanned = sites.filter((s) => s.ok);
const fmtDate = (d) => new Date(d).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const techHref = (name) => `#/teknik/${encodeURIComponent(name)}`;
const siteHref = (domain) => `#/sajt/${encodeURIComponent(domain)}`;
const byCat = (s, cat) => s.technologies.filter((t) => t.category === cat);
const branscher = [...new Set(sites.map((s) => s.category))].sort((a, b) => a.localeCompare(b, 'sv'));

// Antal sajter per teknik (bara lyckade skanningar räknas i andelar)
const usage = {};
for (const s of scanned) for (const t of s.technologies) usage[t.name] = (usage[t.name] || 0) + 1;

document.getElementById('footer').innerHTML =
  `Senast skannad ${fmtDate(data.scannedAt)} · ${sites.length} sajter · ${Object.keys(technologies).length} tekniker i signaturdatabasen`;

function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  const nav = { sajt: 'sajter', teknik: 'tekniker' }[parts[0]] || parts[0] || 'sajter';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  if (parts[0] === 'sajt') renderSite(parts[1]);
  else if (parts[0] === 'teknik') renderTech(parts[1]);
  else if (parts[0] === 'tekniker') renderTechList();
  else if (parts[0] === 'andringar') renderChanges();
  else if (parts[0] === 'om') renderAbout();
  else renderHome(params);
  if (!params.toString()) window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Hem / sajtlista

function primaryStack(s) {
  const platform = byCat(s, 'platform');
  const cms = byCat(s, 'cms');
  return { platform, cms };
}

function platformLabel(s) {
  if (!s.ok && !s.technologies.length) return s.blocked ? 'Blockerade skanning' : 'Ej nåbar';
  const { platform, cms } = primaryStack(s);
  if (platform.length) return platform.map((t) => t.name).join(' + ');
  if (cms.length) return `${cms[0].name} (CMS)`;
  return 'Ej identifierad';
}

function barList(rows, total, { onClick } = {}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return `<ul class="bars">${rows
    .map(
      (r) => `<li title="${esc(r.name)}: ${r.count} av ${total} sajter (${pct(r.count, total)} %)">
        ${onClick ? `<button class="lnk" data-pick="${esc(r.name)}">${esc(r.name)}</button>` : `<a href="${r.href}">${esc(r.name)}</a>`}
        <span class="track"><span class="fill" style="width:${(r.count / max) * 100}%"></span></span>
        <span class="val">${r.count} · ${pct(r.count, total)} %</span>
      </li>`,
    )
    .join('')}</ul>`;
}

function distribution(cat, { includeUnknown = false } = {}) {
  const counts = {};
  for (const s of scanned) {
    const names = byCat(s, cat).map((t) => t.name);
    if (!names.length && includeUnknown) counts['Ej identifierad'] = (counts['Ej identifierad'] || 0) + 1;
    for (const n of names) counts[n] = (counts[n] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, href: name === 'Ej identifierad' ? '#/?plattform=none' : techHref(name) }))
    .sort((a, b) => b.count - a.count);
}

function renderHome(params) {
  const state = {
    q: params.get('q') || '',
    bransch: params.get('bransch') || '',
    plattform: params.get('plattform') || '',
    has: (params.get('har') || '').split(',').filter(Boolean),
    not: (params.get('harinte') || '').split(',').filter(Boolean),
    sort: params.get('sort') || 'name',
    asc: params.get('dir') !== 'desc',
  };

  const platforms = distribution('platform');
  const withPlatform = scanned.filter((s) => byCat(s, 'platform').length).length;
  const cmsDist = distribution('cms');

  app.innerHTML = `
    <h1>Teknik på Sveriges största e-handelssajter</h1>
    <p class="lead">Se vilken e-handelsplattform och vilket CMS ${sites.length} stora svenska e-handlare kör, och vilka lösningar de har för betalning, frakt, sök, marknadsföring och analys. Filtrera på vad sajterna har och inte har.</p>

    <div class="grid stats">
      <div class="card stat"><div class="num">${sites.length}</div><div class="lbl">sajter i listan</div></div>
      <div class="card stat"><div class="num">${scanned.length}</div><div class="lbl">skannade utan blockering</div></div>
      <div class="card stat"><div class="num">${withPlatform}</div><div class="lbl">med identifierad plattform</div></div>
      <div class="card stat"><div class="num">${changes.length}</div><div class="lbl">teknikändringar loggade</div></div>
    </div>

    <div class="grid two">
      <div class="card">
        <h2>E-handelsplattformar</h2>
        ${barList(platforms.slice(0, 12), scanned.length)}
        <p class="small muted">Andel av ${scanned.length} skannade sajter. ${scanned.length - withPlatform} sajter kör en egenutvecklad eller headless lösning som inte syns utifrån.</p>
      </div>
      <div class="card">
        <h2>CMS</h2>
        ${barList(cmsDist.slice(0, 12), scanned.length)}
        <p class="small muted">Klicka på en teknik för att se alla sajter som använder den.</p>
      </div>
    </div>

    <div class="card">
      <h2>Hitta sajter</h2>
      <div class="filters">
        <label class="f">Sök
          <input id="q" type="search" placeholder="Namn eller domän" value="${esc(state.q)}">
        </label>
        <label class="f">Bransch
          <select id="bransch"><option value="">Alla branscher</option>${branscher
            .map((b) => `<option ${b === state.bransch ? 'selected' : ''}>${esc(b)}</option>`)
            .join('')}</select>
        </label>
        <label class="f">Plattform
          <select id="plattform"><option value="">Alla</option><option value="none" ${state.plattform === 'none' ? 'selected' : ''}>Ej identifierad</option>${platforms
            .map((p) => `<option ${p.name === state.plattform ? 'selected' : ''}>${esc(p.name)}</option>`)
            .join('')}</select>
        </label>
        <label class="f">Har teknik
          <input id="har" list="techlist" placeholder="t.ex. Klarna">
          <span class="chips">${state.has.map((t) => `<span class="chip">${esc(t)} <button data-rm-has="${esc(t)}" aria-label="Ta bort">×</button></span>`).join('')}</span>
        </label>
        <label class="f">Har inte teknik
          <input id="harinte" list="techlist" placeholder="t.ex. Walley">
          <span class="chips">${state.not.map((t) => `<span class="chip not">${esc(t)} <button data-rm-not="${esc(t)}" aria-label="Ta bort">×</button></span>`).join('')}</span>
        </label>
      </div>
      <datalist id="techlist">${Object.keys(technologies)
        .sort((a, b) => a.localeCompare(b, 'sv'))
        .map((t) => `<option value="${esc(t)}">${esc(categories[technologies[t].category])}</option>`)
        .join('')}</datalist>
      <div id="results"></div>
    </div>`;

  const update = (patch) => {
    Object.assign(state, patch);
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.bransch) p.set('bransch', state.bransch);
    if (state.plattform) p.set('plattform', state.plattform);
    if (state.has.length) p.set('har', state.has.join(','));
    if (state.not.length) p.set('harinte', state.not.join(','));
    if (state.sort !== 'name') p.set('sort', state.sort);
    if (!state.asc) p.set('dir', 'desc');
    history.replaceState(null, '', `#/${p.toString() ? '?' + p : ''}`);
    renderResults(state, update);
  };

  const q = document.getElementById('q');
  q.addEventListener('input', () => update({ q: q.value }));
  document.getElementById('bransch').addEventListener('change', (e) => update({ bransch: e.target.value }));
  document.getElementById('plattform').addEventListener('change', (e) => update({ plattform: e.target.value }));
  for (const [id, key] of [['har', 'has'], ['harinte', 'not']]) {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (technologies[v] && !state[key].includes(v)) {
        state[key].push(v);
        update({});
        renderHome(new URLSearchParams(location.hash.split('?')[1] || ''));
      }
    });
  }
  app.querySelectorAll('[data-rm-has],[data-rm-not]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (b.dataset.rmHas) state.has = state.has.filter((t) => t !== b.dataset.rmHas);
      if (b.dataset.rmNot) state.not = state.not.filter((t) => t !== b.dataset.rmNot);
      update({});
      renderHome(new URLSearchParams(location.hash.split('?')[1] || ''));
    }),
  );
  renderResults(state, update);
}

function filterSites(state) {
  const q = state.q.toLowerCase();
  return sites.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q) && !s.domain.includes(q)) return false;
    if (state.bransch && s.category !== state.bransch) return false;
    if (state.plattform === 'none' && (!s.ok || byCat(s, 'platform').length)) return false;
    if (state.plattform && state.plattform !== 'none' && !s.techSet.has(state.plattform)) return false;
    if (state.has.some((t) => !s.techSet.has(t))) return false;
    // "Har inte" kräver en lyckad skanning – annars vet vi inte.
    if (state.not.length && (!s.ok || state.not.some((t) => s.techSet.has(t)))) return false;
    return true;
  });
}

const COLUMNS = [
  { key: 'name', label: 'Sajt', sort: (s) => s.name.toLowerCase() },
  { key: 'category', label: 'Bransch', sort: (s) => s.category, cls: 'hide-sm' },
  { key: 'platform', label: 'Plattform', sort: (s) => platformLabel(s) },
  { key: 'cms', label: 'CMS', sort: (s) => byCat(s, 'cms')[0]?.name || '~' },
  { key: 'payment', label: 'Betalning', sort: (s) => byCat(s, 'payment').length, cls: 'hide-sm' },
  { key: 'shipping', label: 'Frakt', sort: (s) => byCat(s, 'shipping').length, cls: 'hide-sm' },
];

function tags(list, cls = '') {
  return list.map((t) => `<a class="tag ${cls} ${t.manual ? 'manual' : ''}" href="${techHref(t.name)}">${esc(t.name)}</a>`).join('');
}

function platformCell(s) {
  const { platform, cms } = primaryStack(s);
  if (platform.length) return tags(platform, 'platform');
  if (!s.ok && !s.technologies.length) return `<span class="tag warn">${s.blocked ? 'Blockerade skanning' : 'Ej nåbar'}</span>`;
  const frontend = byCat(s, 'frontend').filter((t) => !['React', 'Vue.js'].includes(t.name));
  return `<span class="tag soft">${frontend.length || cms.length ? 'Headless/egen' : 'Ej identifierad'}</span>${tags(frontend)}`;
}

function renderResults(state, update) {
  const col = COLUMNS.find((c) => c.key === state.sort) || COLUMNS[0];
  const list = filterSites(state).sort((a, b) => {
    const x = col.sort(a);
    const y = col.sort(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (state.asc ? 1 : -1);
  });
  const el = document.getElementById('results');
  el.innerHTML = `
    <div class="toolbar">
      <strong>${list.length} sajter</strong>
      <button id="csv">Ladda ner CSV</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${COLUMNS.map(
        (c) => `<th data-sort="${c.key}" class="${c.cls || ''} ${c.key === state.sort ? 'sorted' + (state.asc ? ' asc' : '') : ''}">${c.label}</th>`,
      ).join('')}</tr></thead>
      <tbody>${list
        .map(
          (s) => `<tr>
          <td><a href="${siteHref(s.domain)}">${esc(s.name)}</a><div class="dom">${esc(s.domain)}</div></td>
          <td class="hide-sm">${esc(s.category)}</td>
          <td>${platformCell(s)}</td>
          <td>${tags(byCat(s, 'cms'))}</td>
          <td class="hide-sm">${tags(byCat(s, 'payment').slice(0, 5))}</td>
          <td class="hide-sm">${tags(byCat(s, 'shipping').slice(0, 4))}</td>
        </tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <p class="small muted">* = manuellt angiven. Klicka på en kolumnrubrik för att sortera.</p>`;

  el.querySelectorAll('th[data-sort]').forEach((th) =>
    th.addEventListener('click', () =>
      update({ sort: th.dataset.sort, asc: th.dataset.sort === state.sort ? !state.asc : true }),
    ),
  );
  el.querySelector('#csv').addEventListener('click', () => downloadCsv(list));
}

function downloadCsv(list) {
  const cats = Object.keys(categories);
  const header = ['Sajt', 'Domän', 'Bransch', 'Status', ...cats.map((c) => categories[c])];
  const rows = list.map((s) => [
    s.name,
    s.domain,
    s.category,
    s.ok ? 'OK' : s.blocked ? 'Blockerad' : 'Ej nåbar',
    ...cats.map((c) => byCat(s, c).map((t) => t.name).join(', ')),
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `techstack-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------------ Sajt

function renderSite(domain) {
  const s = sites.find((x) => x.domain === domain);
  if (!s) return (app.innerHTML = `<h1>Hittade inte ${esc(domain)}</h1><p><a href="#/">Till listan</a></p>`);
  const grouped = Object.keys(categories)
    .map((c) => [c, byCat(s, c)])
    .filter(([, l]) => l.length);
  const siteChanges = changes.filter((c) => c.domain === domain).reverse();
  const status = s.ok
    ? `Skannad ${fmtDate(s.scannedAt)}`
    : s.blocked
      ? `Sajten blockerade senaste skanningen (HTTP ${s.status})`
      : `Kunde inte nås${s.error ? ` (${esc(s.error)})` : ''}`;

  app.innerHTML = `
    <p class="small"><a href="#/">← Alla sajter</a></p>
    <h1>${esc(s.name)}</h1>
    <p class="lead"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.domain)}</a> · ${esc(s.category)} · ${status}${
      s.lastError ? ` · senaste försöket misslyckades ${fmtDate(s.lastAttempt)}` : ''
    }</p>
    <div class="grid stats">
      <div class="card stat"><div class="lbl">E-handelsplattform</div><div class="num" style="font-size:1.3rem">${esc(
        byCat(s, 'platform').map((t) => t.name).join(' + ') || '–',
      )}</div></div>
      <div class="card stat"><div class="lbl">CMS</div><div class="num" style="font-size:1.3rem">${esc(
        byCat(s, 'cms').map((t) => t.name).join(' + ') || '–',
      )}</div></div>
      <div class="card stat"><div class="lbl">Frontend</div><div class="num" style="font-size:1.3rem">${esc(
        byCat(s, 'frontend').map((t) => t.name).join(' + ') || '–',
      )}</div></div>
      <div class="card stat"><div class="lbl">Tekniker hittade</div><div class="num" style="font-size:1.3rem">${s.technologies.length}</div></div>
    </div>
    <div class="cats">${grouped
      .map(
        ([c, list]) => `<div class="card"><h3>${esc(categories[c])}</h3>${list
          .map(
            (t) => `<div class="tech-row"><a href="${techHref(t.name)}">${esc(t.name)}</a>${t.manual ? ' <span class="small muted">(manuellt angiven)</span>' : ''}
              <div class="evidence">${t.evidence.map(esc).join('<br>')}</div></div>`,
          )
          .join('')}</div>`,
      )
      .join('')}</div>
    ${
      siteChanges.length
        ? `<div class="card"><h2>Ändringar</h2>${siteChanges.map(changeRow).join('')}</div>`
        : ''
    }`;
}

// ------------------------------------------------------------------ Teknik

function renderTech(name) {
  const t = technologies[name];
  if (!t) return (app.innerHTML = `<h1>Okänd teknik</h1><p><a href="#/tekniker">Alla tekniker</a></p>`);
  const list = sites.filter((s) => s.techSet.has(name)).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const count = usage[name] || 0;
  const peers = Object.entries(technologies)
    .filter(([, x]) => x.category === t.category)
    .map(([n]) => ({ name: n, count: usage[n] || 0, href: techHref(n) }))
    .filter((r) => r.count)
    .sort((a, b) => b.count - a.count);

  app.innerHTML = `
    <p class="small"><a href="#/tekniker">← Alla tekniker</a></p>
    <h1>${esc(name)}</h1>
    <p class="lead">${esc(categories[t.category])} · används av ${count} av ${scanned.length} skannade sajter (${pct(count, scanned.length)} %) · <a href="${esc(t.website)}" target="_blank" rel="noopener">${esc(t.website.replace(/^https?:\/\/(www\.)?/, ''))}</a></p>
    <div class="grid two">
      <div class="card">
        <h2>Sajter med ${esc(name)}</h2>
        ${list.length ? `<table><tbody>${list
          .map((s) => `<tr><td><a href="${siteHref(s.domain)}">${esc(s.name)}</a> <span class="dom muted small">${esc(s.domain)}</span></td><td class="muted small">${esc(s.category)}</td></tr>`)
          .join('')}</tbody></table>` : '<p class="muted">Inga sajter i listan använder den här tekniken.</p>'}
        <p><a href="#/?har=${encodeURIComponent(name)}">Filtrera listan på ${esc(name)} →</a></p>
      </div>
      <div class="card">
        <h2>Jämfört med andra inom ${esc(categories[t.category].toLowerCase())}</h2>
        ${barList(peers, scanned.length)}
      </div>
    </div>`;
}

function renderTechList() {
  app.innerHTML = `
    <h1>Tekniker</h1>
    <p class="lead">Alla tekniker i signaturdatabasen, grupperade per kategori. Siffran är antal skannade sajter som använder tekniken.</p>
    <div class="cats">${Object.entries(categories)
      .map(([c, label]) => {
        const rows = Object.entries(technologies)
          .filter(([, t]) => t.category === c)
          .map(([n]) => ({ name: n, count: usage[n] || 0, href: techHref(n) }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv'));
        return `<div class="card"><h3>${esc(label)}</h3>${barList(rows, scanned.length)}</div>`;
      })
      .join('')}</div>`;
}

// ------------------------------------------------------------------ Ändringar

function changeRow(c) {
  const s = sites.find((x) => x.domain === c.domain);
  return `<div class="tech-row change"><span class="muted small">${fmtDate(c.date)}</span> ·
    <a href="${siteHref(c.domain)}">${esc(s?.name || c.domain)}</a>
    ${c.added.map((t) => `<span class="add">+ <a class="add" href="${techHref(t)}">${esc(t)}</a></span>`).join(' ')}
    ${c.removed.map((t) => `<span class="rem">− <a class="rem" href="${techHref(t)}">${esc(t)}</a></span>`).join(' ')}</div>`;
}

function renderChanges() {
  const list = [...changes].reverse();
  app.innerHTML = `
    <h1>Teknikändringar</h1>
    <p class="lead">Tekniker som tillkommit eller försvunnit mellan två lyckade skanningar. Byte av e-handelsplattform eller CMS betyder ofta en ny sajt, och då väljs nya leverantörer.</p>
    <div class="card">${list.length ? list.slice(0, 500).map(changeRow).join('') : '<p class="muted">Inga ändringar ännu. De loggas från andra skanningen och framåt.</p>'}</div>`;
}

function renderAbout() {
  app.innerHTML = `
    <h1>Om TechStack</h1>
    <div class="card" style="max-width:75ch">
      <p>TechStack besöker startsidan på stora svenska e-handelssajter med en riktig webbläsare, godkänner cookiebannern och samlar ihop sidans HTML, svarshuvuden, cookies, nätverksanrop och globala JavaScript-variabler. Det jämförs sedan mot en signaturdatabas med ${Object.keys(technologies).length} tekniker.</p>
      <h3>Hur säkert är det?</h3>
      <p>Varje träff visas med sitt bevis på sajtens sida, t.ex. en URL till <code>cdn.shopify.com</code> eller en <code>dwsid</code>-cookie från Salesforce Commerce Cloud. Plattformar som körs helt headless, där frontend pratar med plattformen från servern, syns inte utifrån. De markeras som <em>Headless/egen</em>.</p>
      <p>Betal- och fraktlösningar hittas delvis genom att logotyper och namn nämns på startsidan. Det betyder att sajten erbjuder lösningen, men den kan gå via en annan leverantör i kassan.</p>
      <h3>Blockerade sajter</h3>
      <p>Vissa sajter har botskydd (Cloudflare, Akamai m.fl.) som stoppar skanningen. Då behålls förra lyckade resultatet, och kända uppgifter kan läggas in manuellt i <code>data/overrides.json</code>. Manuella uppgifter markeras med *.</p>
    </div>`;
}

window.addEventListener('hashchange', route);
route();
