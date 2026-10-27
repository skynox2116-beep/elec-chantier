'use strict';
/* Élec Chantier — chiffrage d'appareillage électrique sur photos de chantier */

/* ---------- Types d'appareillage ---------- */
const DEFAULT_TYPES = [
  { id: 'prise', label: 'Prise 2P+T', sym: 'P', color: '#1565c0' },
  { id: 'prise_double', label: 'Prise double', sym: 'P2', color: '#1565c0' },
  { id: 'prise_spec', label: 'Prise spécialisée (32 A)', sym: 'PS', color: '#0d47a1' },
  { id: 'inter_simple', label: 'Interrupteur simple allumage', sym: 'I', color: '#e65100' },
  { id: 'inter_va', label: 'Interrupteur va-et-vient', sym: 'VV', color: '#e65100' },
  { id: 'inter_double', label: 'Interrupteur double', sym: 'I2', color: '#e65100' },
  { id: 'bp', label: 'Bouton poussoir', sym: 'BP', color: '#bf360c' },
  { id: 'variateur', label: 'Variateur', sym: 'V', color: '#bf360c' },
  { id: 'lum_plafond', label: 'Point lumineux plafond', sym: 'L', color: '#f9a825' },
  { id: 'applique', label: 'Applique murale', sym: 'A', color: '#f9a825' },
  { id: 'spot', label: 'Spot encastré', sym: 'S', color: '#f9a825' },
  { id: 'rj45', label: 'Prise RJ45', sym: 'RJ', color: '#2e7d32' },
  { id: 'tv', label: 'Prise TV', sym: 'TV', color: '#2e7d32' },
  { id: 'detecteur', label: 'Détecteur de fumée', sym: 'DF', color: '#c62828' },
  { id: 'vmc', label: 'Sortie VMC', sym: 'VMC', color: '#00838f' },
  { id: 'tableau', label: 'Tableau électrique', sym: 'TE', color: '#4527a0' },
];
const CUSTOM_COLORS = ['#6a1b9a', '#ad1457', '#00695c', '#37474f', '#4e342e'];

function getTypes() {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('customTypes') || '[]'); } catch (e) {}
  return DEFAULT_TYPES.concat(custom);
}
function addCustomType(label) {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('customTypes') || '[]'); } catch (e) {}
  const sym = label.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  custom.push({ id: 'c_' + Date.now(), label, sym, color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length] });
  localStorage.setItem('customTypes', JSON.stringify(custom));
}
const typeById = (id) => getTypes().find((t) => t.id === id);

/* ---------- Base IndexedDB ---------- */
let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open('elec-chantier', 1);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      d.createObjectStore('sites', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('site', 'siteId');
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
const dbAll = (s) => tx(s, 'readonly', (o) => o.getAll());
const dbGet = (s, id) => tx(s, 'readonly', (o) => o.get(id));
const dbPut = (s, v) => tx(s, 'readwrite', (o) => o.put(v));
const dbDel = (s, id) => tx(s, 'readwrite', (o) => o.delete(id));
const photosOf = async (siteId) =>
  (await dbAll('photos')).filter((p) => p.siteId === siteId).sort((a, b) => a.created - b.created);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Utilitaires UI ---------- */
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let urls = [];
const blobUrl = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
function freeUrls() { urls.forEach(URL.revokeObjectURL); urls = []; }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function setBar(title, back, menu) {
  $('#title').textContent = title;
  $('#back').hidden = !back; $('#back').onclick = back || null;
  $('#menu').hidden = !menu; $('#menu').onclick = menu || null;
}
function sheet(items) {
  const d = document.createElement('dialog');
  d.innerHTML = '<div class="menu">' + items.map((it, i) => `<button data-i="${i}">${esc(it.label)}</button>`).join('') +
    '<button data-i="x" class="mut">Annuler</button></div>';
  d.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) { if (e.target === d) { d.close(); } return; }
    d.close();
    if (b.dataset.i !== 'x') items[+b.dataset.i].run();
  };
  d.onclose = () => d.remove();
  document.body.appendChild(d); d.showModal();
}
const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'chantier';
const countMarks = (photos) => {
  const c = {};
  photos.forEach((p) => p.marks.forEach((m) => { c[m.type] = (c[m.type] || 0) + 1; }));
  return c;
};

/* ---------- Routage ---------- */
const go = (h) => { location.hash = h; };
window.addEventListener('hashchange', route);
async function route() {
  freeUrls();
  const [, kind, id] = location.hash.split('/');
  try {
    if (kind === 's') await siteView(id);
    else if (kind === 'p') await photoView(id);
    else await homeView();
  } catch (e) { console.error(e); view.innerHTML = '<div class="empty">Erreur : ' + esc(e.message) + '</div>'; }
}

/* ---------- Accueil : liste des chantiers ---------- */
async function homeView() {
  setBar('Élec Chantier', null, () => sheet([
    { label: 'Ajouter un type d’appareillage', run: () => {
      const n = (prompt('Nom du nouvel appareillage (ex. Prise USB) :') || '').trim();
      if (n) { addCustomType(n); toast('Type ajouté'); }
    } },
  ]));
  const sites = (await dbAll('sites')).sort((a, b) => b.created - a.created);
  const photos = await dbAll('photos');
  view.innerHTML = (sites.length
    ? sites.map((s) => {
        const ph = photos.filter((p) => p.siteId === s.id);
        const n = ph.reduce((a, p) => a + p.marks.length, 0);
        return `<div class="card row" data-id="${s.id}" role="button"><div class="grow"><strong>${esc(s.name)}</strong>
          <div class="mut">${ph.length} photo(s) · ${n} appareil(s)</div></div><span>›</span></div>`;
      }).join('')
    : '<div class="empty">Aucun chantier.<br>Appuyez sur « + Chantier » pour commencer.</div>') +
    '<button class="btn fab" id="new">+ Chantier</button>';
  view.querySelectorAll('.card').forEach((c) => (c.onclick = () => go('/s/' + c.dataset.id)));
  $('#new').onclick = async () => {
    const name = (prompt('Nom du chantier :') || '').trim();
    if (!name) return;
    const s = { id: uid(), name, created: Date.now() };
    await dbPut('sites', s); go('/s/' + s.id);
  };
}

/* ---------- Image : redimensionnement ---------- */
async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, w: c.width, h: c.height };
}

/* ---------- Vue chantier ---------- */
async function siteView(siteId) {
  const site = await dbGet('sites', siteId);
  if (!site) return go('/');
  const photos = await photosOf(siteId);
  const counts = countMarks(photos);
  const types = getTypes().filter((t) => counts[t.id]);
  const total = types.reduce((a, t) => a + counts[t.id], 0);

  setBar(site.name, () => go('/'), () => sheet([
    { label: 'Exporter le tableur Excel', run: () => exportXlsx(site) },
    { label: 'Renommer le chantier', run: async () => {
      const n = (prompt('Nouveau nom :', site.name) || '').trim();
      if (n) { site.name = n; await dbPut('sites', site); route(); }
    } },
    { label: 'Supprimer le chantier', run: async () => {
      if (!confirm('Supprimer « ' + site.name + ' » et toutes ses photos ?')) return;
      for (const p of photos) await dbDel('photos', p.id);
      await dbDel('sites', site.id); go('/');
    } },
  ]));

  view.innerHTML =
    '<h2>Volume d’appareillage</h2><div class="card">' +
    (total
      ? '<table>' + types.map((t) => `<tr><td><span class="sym" style="background:${t.color}">${esc(t.sym)}</span></td>
          <td>${esc(t.label)}</td><td class="n">${counts[t.id]}</td></tr>`).join('') +
        `<tr><th></th><th>Total</th><th class="n">${total}</th></tr></table>`
      : '<div class="mut">Ajoutez des photos puis placez les appareils dessus.</div>') +
    '</div><h2>Photos</h2>' +
    (photos.length
      ? '<div class="grid">' + photos.map((p) => `<div class="thumb" data-id="${p.id}">
          <img src="${blobUrl(p.blob)}" alt=""><span class="badge">${p.marks.length}</span>
          <div class="cap">${esc(p.name)}</div></div>`).join('') + '</div>'
      : '<div class="empty">Aucune photo pour ce chantier.</div>') +
    `<div class="fabs"><button class="btn" id="cam">📷 Photo</button><button class="btn sec" id="imp">🖼 Importer</button>
     <button class="btn sec" id="xls">📊 Excel</button></div>
     <input type="file" id="fcam" accept="image/*" capture="environment" hidden>
     <input type="file" id="fimp" accept="image/*" multiple hidden>`;

  view.querySelectorAll('.thumb').forEach((t) => (t.onclick = () => go('/p/' + t.dataset.id)));
  const addFiles = async (files) => {
    if (!files.length) return;
    toast('Import en cours…');
    let last;
    for (const f of files) {
      const { blob, w, h } = await shrink(f);
      const n = (await photosOf(siteId)).length + 1;
      last = { id: uid(), siteId, created: Date.now() + n, name: 'Pièce ' + n, blob, w, h, marks: [] };
      await dbPut('photos', last);
    }
    if (files.length === 1) go('/p/' + last.id); else route();
  };
  $('#cam').onclick = () => $('#fcam').click();
  $('#imp').onclick = () => $('#fimp').click();
  $('#xls').onclick = () => exportXlsx(site);
  $('#fcam').onchange = (e) => addFiles([...e.target.files]);
  $('#fimp').onchange = (e) => addFiles([...e.target.files]);
}

/* ---------- Éditeur de photo : pose des appareils ---------- */
async function photoView(photoId) {
  const photo = await dbGet('photos', photoId);
  if (!photo) return go('/');
  const bmp = await createImageBitmap(photo.blob);
  const types = getTypes();
  let cur = localStorage.getItem('lastType') || types[0].id;
  let sel = null;               // repère sélectionné
  let drag = null;
  const hist = [];
  const R = Math.max(16, Math.round(bmp.width * 0.024));

  setBar(photo.name, () => go('/s/' + photo.siteId), () => sheet([
    { label: 'Renommer la pièce', run: () => {
      const n = (prompt('Nom de la pièce :', photo.name) || '').trim();
      if (n) { photo.name = n; $('#title').textContent = n; save(true); }
    } },
    { label: 'Enregistrer l’image annotée', run: saveImage },
    { label: 'Supprimer cette photo', run: async () => {
      if (!confirm('Supprimer cette photo ?')) return;
      await dbDel('photos', photo.id); go('/s/' + photo.siteId);
    } },
  ]));

  view.innerHTML = `<div id="ed">
    <div id="pal"></div>
    <div id="cv-wrap"><canvas id="cv" width="${bmp.width}" height="${bmp.height}"></canvas></div>
    <div class="mut" id="info"></div>
    <div class="tools"><button class="btn sec" id="undo">↶ Annuler</button>
      <button class="btn sec" id="del">🗑 Retirer</button>
      <button class="btn" id="done">Terminé</button></div></div>`;
  const cv = $('#cv'), g = cv.getContext('2d');

  function palette() {
    const cnt = countMarks([photo]);
    $('#pal').innerHTML = types.map((t) => `<button class="chip ${t.id === cur ? 'on' : ''}" data-id="${t.id}">
      <span class="sym" style="background:${t.color}">${esc(t.sym)}</span>${esc(t.label)}${cnt[t.id] ? ' <b>×' + cnt[t.id] + '</b>' : ''}</button>`).join('');
    $('#pal').querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
      cur = b.dataset.id; localStorage.setItem('lastType', cur);
      sel = null;
      palette(); draw();
    }));
    $('#info').textContent = photo.marks.length + ' appareil(s) sur cette photo · touchez pour poser, glissez pour déplacer';
  }
  function drawMark(m, selected) {
    const t = typeById(m.type) || { sym: '?', color: '#555' };
    g.beginPath(); g.arc(m.x, m.y, R, 0, 7);
    g.fillStyle = t.color; g.fill();
    g.lineWidth = Math.max(3, R / 5); g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(R * (t.sym.length > 2 ? 0.7 : 0.95))}px system-ui,sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.sym, m.x, m.y + 1);
    if (selected) {
      g.beginPath(); g.arc(m.x, m.y, R + 7, 0, 7);
      g.lineWidth = 4; g.setLineDash([8, 6]); g.strokeStyle = '#ffeb3b'; g.stroke(); g.setLineDash([]);
    }
  }
  function draw(withSel = true) {
    g.drawImage(bmp, 0, 0);
    photo.marks.forEach((m) => drawMark(m, withSel && m.id === sel));
  }
  let saveT;
  function save(now) {
    clearTimeout(saveT);
    const run = () => dbPut('photos', photo);
    if (now) run(); else saveT = setTimeout(run, 250);
  }
  const snap = () => { hist.push(JSON.stringify(photo.marks)); if (hist.length > 50) hist.shift(); };
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
  };
  const hit = (p) => {
    for (let i = photo.marks.length - 1; i >= 0; i--) {
      const m = photo.marks[i];
      if (Math.hypot(m.x - p.x, m.y - p.y) <= R * 1.4) return m;
    }
    return null;
  };

  cv.onpointerdown = (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = pos(e); let m = hit(p);
    snap();
    if (!m) { m = { id: uid(), type: cur, x: p.x, y: p.y }; photo.marks.push(m); }
    sel = m.id; drag = { dx: m.x - p.x, dy: m.y - p.y, m, moved: false };
    draw(); palette();
  };
  cv.onpointermove = (e) => {
    if (!drag) return;
    const p = pos(e);
    drag.m.x = Math.max(0, Math.min(cv.width, p.x + drag.dx));
    drag.m.y = Math.max(0, Math.min(cv.height, p.y + drag.dy));
    drag.moved = true; draw();
  };
  cv.onpointerup = cv.onpointercancel = () => { if (drag) { drag = null; save(); } };

  $('#undo').onclick = () => {
    if (!hist.length) return toast('Rien à annuler');
    photo.marks = JSON.parse(hist.pop()); sel = null; save(); draw(); palette();
  };
  $('#del').onclick = () => {
    if (!sel) return toast('Touchez d’abord un repère');
    snap(); photo.marks = photo.marks.filter((m) => m.id !== sel); sel = null; save(); draw(); palette();
  };
  $('#done').onclick = async () => { await dbPut('photos', photo); go('/s/' + photo.siteId); };

  async function saveImage() {
    draw(false);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    draw();
    const name = safeName(photo.name) + '.jpg';
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(blob, name);
  }

  palette(); draw();
  window.addEventListener('hashchange', () => bmp.close && bmp.close(), { once: true });
}

/* ---------- Export Excel ---------- */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportXlsx(site) {
  const photos = await photosOf(site.id);
  const counts = countMarks(photos);
  const types = getTypes().filter((t) => counts[t.id]);
  if (!types.length) return toast('Aucun appareil placé pour l’instant');
  const date = new Date().toLocaleDateString('fr-FR');

  const rows1 = [
    [{ v: 'Chantier : ' + site.name, s: 2 }], ['Date : ' + date], [],
    [{ v: 'Appareillage', s: 1 }, { v: 'Quantité', s: 1 }],
  ];
  types.forEach((t) => rows1.push([t.label, counts[t.id]]));
  const first = 5, last = 4 + types.length;
  rows1.push([{ v: 'TOTAL', s: 3 }, { v: types.reduce((a, t) => a + counts[t.id], 0), f: `SUM(B${first}:B${last})`, s: 3 }]);

  const head = [{ v: 'Pièce / photo', s: 1 }].concat(types.map((t) => ({ v: t.label, s: 1 })), [{ v: 'Total', s: 1 }]);
  const rows2 = [head];
  photos.forEach((p, i) => {
    const c = countMarks([p]);
    const r = i + 2;
    const vals = types.map((t) => c[t.id] || 0);
    rows2.push([p.name].concat(vals, [{ v: vals.reduce((a, b) => a + b, 0), f: `SUM(B${r}:${colName(types.length)}${r})` }]));
  });
  const tr = photos.length + 2;
  const totRow = [{ v: 'TOTAL', s: 3 }];
  for (let i = 0; i <= types.length; i++) {
    const col = colName(i + 1);
    const v = i < types.length ? counts[types[i].id] : types.reduce((a, t) => a + counts[t.id], 0);
    totRow.push({ v, f: `SUM(${col}2:${col}${tr - 1})`, s: 3 });
  }
  rows2.push(totRow);

  const blob = buildXlsx([
    { name: 'Récapitulatif', rows: rows1, widths: [34, 12] },
    { name: 'Par pièce', rows: rows2, widths: [24].concat(types.map(() => 16), [10]) },
  ]);
  const name = safeName(site.name) + ' - appareillage.xlsx';
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name);
  toast('Tableur téléchargé');
}

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
route();
