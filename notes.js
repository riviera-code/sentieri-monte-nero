'use strict';
// Note e foto geolocalizzate dei sopralluoghi.
// - Pubbliche: chiunque apra il sito le vede (sopralluoghi/notes.json + sopralluoghi/foto/).
// - Le aggiunge solo chi ha collegato una chiave GitHub sul proprio telefono.
// - Sul sentiero si salvano prima sul telefono (IndexedDB) e si caricano appena c'è rete.

const REPO = 'riviera-code/sentieri-monte-nero';
const BRANCH = 'main';
const DATA_DIR = 'sopralluoghi';
const NOTES_PATH = `${DATA_DIR}/notes.json`;

const NOTE_TYPES = [
  { id: 'nota', icon: '📝', label: 'Nota' },
  { id: 'problema', icon: '⚠️', label: 'Problema' },
  { id: 'bivio', icon: '🔀', label: 'Bivio' },
  { id: 'acqua', icon: '💧', label: 'Acqua' },
  { id: 'panorama', icon: '👀', label: 'Panorama' },
  { id: 'lavori', icon: '🛠️', label: 'Da sistemare' },
];
const typeOf = (id) => NOTE_TYPES.find((t) => t.id === id) || NOTE_TYPES[0];
const PHOTO_MAX = 1600, THUMB_MAX = 320;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- archivio sul telefono (IndexedDB) ----------
// Contiene le note create/modificate qui: dirty = da caricare, deleted = da cancellare online.
const db = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('monte-nero', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('notes', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('notes', mode);
      const out = fn(t.objectStore('notes'));
      t.oncomplete = () => res(out && out.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('memoria del telefono piena?'));
    });
  };
  return {
    all: () => tx('readonly', (s) => s.getAll()),
    put: (n) => tx('readwrite', (s) => s.put(n)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };
})();
async function persist() {
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* non supportato */ }
}

// ---------- chiave GitHub (solo su questo telefono) ----------
const token = {
  get() { try { return localStorage.getItem('gh-token') || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem('gh-token', v) : localStorage.removeItem('gh-token'); } catch { /* storage bloccato */ } },
};
const canEdit = () => !!token.get();

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.get()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}

// ---------- foto ----------
async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fallback sotto */ }
  }
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Foto non leggibile'));
    img.src = URL.createObjectURL(file);
  });
}
function resize(img, max, quality) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}
async function makePhoto(file) {
  const img = await loadImage(file);
  const [blob, thumb] = await Promise.all([resize(img, PHOTO_MAX, 0.82), resize(img, THUMB_MAX, 0.7)]);
  return { id: uid(), blob, thumb, taken: file.lastModified || Date.now() };
}
const urls = new Map();
const urlOf = (blob) => { if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob)); return urls.get(blob); };
// Foto ancora sul telefono → blob; foto già online → file del sito.
const thumbSrc = (p) => (p.thumb instanceof Blob ? urlOf(p.thumb) : p.thumb_path);
const photoSrc = (p) => (p.blob instanceof Blob ? urlOf(p.blob) : p.path);

// ---------- stato: note online + modifiche locali ----------
let remote = [];   // da sopralluoghi/notes.json
let local = [];    // da IndexedDB
let notes = [];    // quello che si vede
const noteLayer = L.featureGroup().addTo(map);
const markers = new Map();

function merge() {
  const byId = new Map(remote.map((n) => [n.id, n]));
  for (const l of local) {
    if (l.deleted) byId.delete(l.id);
    else if (!byId.has(l.id) || l.dirty || (l.updated || 0) >= (byId.get(l.id).updated || 0)) byId.set(l.id, l);
  }
  notes = [...byId.values()];
  for (const [id, m] of markers) if (!byId.has(id)) { noteLayer.removeLayer(m); markers.delete(id); }
  notes.forEach(drawNote);
  renderNotes();
}

const fmtDate = (t) => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function noteIcon(n) {
  return L.divIcon({ className: '', html: `<div class="note-pin"><span>${typeOf(n.type).icon}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 40], popupAnchor: [0, -38] });
}
function notePopup(n) {
  const t = typeOf(n.type);
  const ph = (n.photos || []).map((p) => `<img src="${esc(thumbSrc(p))}" data-photo="${esc(p.id)}" alt="foto" loading="lazy">`).join('');
  const where = `${Number(n.lat).toFixed(5)}, ${Number(n.lng).toFixed(5)}${n.alt != null ? ' · ' + Math.round(n.alt) + ' m' : ''}`;
  const pending = n.dirty ? ' · <span class="badge-up">⏳ da caricare</span>' : '';
  const acts = canEdit() ? '<button data-act="edit">Modifica</button><button data-act="move">Sposta</button>' : '';
  return `<div class="pop"><h4>${t.icon} ${t.label}</h4>
    <div class="when">${fmtDate(n.created)} · ${where}${pending}</div>
    ${n.text ? `<div class="note-text">${esc(n.text)}</div>` : ''}
    ${ph ? `<div class="photos">${ph}</div>` : ''}
    <div class="acts">${acts}<a href="https://www.google.com/maps/dir/?api=1&destination=${Number(n.lat)},${Number(n.lng)}" target="_blank" rel="noopener">Portami qui</a></div></div>`;
}
function drawNote(n) {
  let m = markers.get(n.id);
  if (!m) {
    m = L.marker([n.lat, n.lng], { icon: noteIcon(n), zIndexOffset: 500 }).addTo(noteLayer);
    m.on('popupopen', (e) => wirePopup(n.id, e.popup));
    m.bindPopup(() => notePopup(notes.find((x) => x.id === n.id)), { maxWidth: 260, autoPanPaddingTopLeft: [10, 90], autoPanPaddingBottomRight: [80, 90] });
    markers.set(n.id, m);
  }
  m.setLatLng([n.lat, n.lng]).setIcon(noteIcon(n));
}
function wirePopup(id, popup) {
  const el = popup.getElement();
  const n = notes.find((x) => x.id === id);
  if (!el || !n) return;
  el.querySelectorAll('[data-photo]').forEach((img) => img.addEventListener('click', () => {
    const p = n.photos.find((x) => x.id === img.dataset.photo); if (p) openViewer(photoSrc(p));
  }));
  el.querySelector('[data-act="edit"]')?.addEventListener('click', () => { map.closePopup(); openForm(n); });
  el.querySelector('[data-act="move"]')?.addEventListener('click', () => startMove(n));
}
function flash(msg, ms = 2500) {
  showStatus(msg);
  setTimeout(() => { if (watchId == null) status.hidden = true; }, ms);
}

async function saveLocal(n) {
  n.dirty = true; n.updated = Date.now();
  await db.put(n);
  const i = local.findIndex((x) => x.id === n.id);
  if (i >= 0) local[i] = n; else local.push(n);
  merge();
  persist();
  scheduleSync();
}

function startMove(n) {
  const m = markers.get(n.id);
  map.closePopup();
  m.dragging.enable();
  showStatus('Trascina il segnaposto nel punto giusto. Si salva quando lo lasci.');
  m.once('dragend', async () => {
    m.dragging.disable();
    const ll = m.getLatLng();
    await saveLocal({ ...n, lat: ll.lat, lng: ll.lng, acc: null });
    flash('Posizione della nota aggiornata.');
  });
}

// ---------- elenco note ----------
function distM(a, b, c, d) {
  const x = (d - b) * Math.PI / 180 * Math.cos((a + c) / 2 * Math.PI / 180), y = (c - a) * Math.PI / 180;
  return 6371000 * Math.hypot(x, y);
}
function renderNotes() {
  $('#notes-count').textContent = notes.length;
  renderSync();
  const box = $('#notes-list');
  box.textContent = '';
  if (!notes.length) {
    box.innerHTML = `<div class="empty">Nessuna nota ancora.${canEdit() ? '<br>Tocca il pulsante verde con la fotocamera per salvare una nota o una foto nel punto in cui sei, oppure tieni premuto un punto della mappa.' : ''}</div>`;
    return;
  }
  for (const n of [...notes].sort((a, b) => b.created - a.created)) {
    const t = typeOf(n.type);
    const row = document.createElement('div');
    row.className = 'note-row';
    const p = n.photos && n.photos[0];
    const dist = me ? ` · a ${fmtDist(distM(me.lat, me.lng, n.lat, n.lng))}` : '';
    row.innerHTML = `${p ? `<img src="${esc(thumbSrc(p))}" alt="" loading="lazy">` : `<div class="ph">${t.icon}</div>`}
      <div class="txt"><div class="name"></div><div class="meta">${t.icon} ${fmtDate(n.created)}${n.photos && n.photos.length ? ' · 📷 ' + n.photos.length : ''}${dist}${n.dirty ? ' <span class="badge-up">⏳</span>' : ''}</div></div>`;
    row.querySelector('.name').textContent = n.text || t.label;
    row.addEventListener('click', () => {
      closeSheet();
      map.setView([n.lat, n.lng], Math.max(map.getZoom(), 17));
      setTimeout(() => markers.get(n.id)?.openPopup(), 250);
    });
    box.appendChild(row);
  }
}

// ---------- modulo nota ----------
const dlg = $('#note-dlg');
let editing = null, isNew = false;

$('#note-types').innerHTML = NOTE_TYPES.map((t) => `<button type="button" data-type="${t.id}">${t.icon} ${t.label}</button>`).join('');
$('#note-types').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  editing.type = b.dataset.type; paintTypes();
});
function paintTypes() { $('#note-types').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.type === editing.type)); }
function paintWhere() {
  const w = $('#note-where');
  if (editing.lat == null) { w.textContent = '📍 Cerco la posizione…'; return; }
  const acc = editing.acc != null ? ` (±${Math.round(editing.acc)} m)` : '';
  const src = editing.src === 'gps' ? 'Posizione GPS' : editing.src === 'map' ? 'Punto scelto sulla mappa' : 'Posizione';
  w.textContent = `📍 ${src}${acc}: ${Number(editing.lat).toFixed(5)}, ${Number(editing.lng).toFixed(5)}${editing.alt != null ? ' · ' + Math.round(editing.alt) + ' m' : ''}`;
}
function paintPhotos() {
  const box = $('#note-photos');
  box.textContent = '';
  for (const p of editing.photos) {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img src="${esc(thumbSrc(p))}" alt="foto"><button type="button" aria-label="Togli foto">✕</button>`;
    d.querySelector('img').addEventListener('click', () => openViewer(photoSrc(p)));
    d.querySelector('button').addEventListener('click', () => { editing.photos = editing.photos.filter((x) => x !== p); paintPhotos(); });
    box.appendChild(d);
  }
}
function openForm(n, at) {
  if (!canEdit()) { openGh(); return; }
  isNew = !n;
  editing = n ? { ...n, photos: [...(n.photos || [])] } : {
    id: uid(), type: 'nota', text: '', photos: [], created: Date.now(), lat: null, lng: null, acc: null, alt: null, src: null,
  };
  $('#note-dlg-title').textContent = isNew ? 'Nuova nota' : 'Modifica nota';
  $('#note-text').value = editing.text || '';
  $('#note-delete').hidden = isNew;
  paintTypes(); paintPhotos();
  if (isNew) { if (at) Object.assign(editing, { lat: at.lat, lng: at.lng, src: 'map' }); else locateForNote(); }
  paintWhere();
  dlg.showModal();
}
function locateForNote() {
  const useFix = (c) => {
    if (!dlg.open || !isNew || editing.src === 'map') return;
    Object.assign(editing, { lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude ?? null, src: 'gps' });
    paintWhere();
  };
  if (me && me.at && Date.now() - me.at < 20000) useFix({ latitude: me.lat, longitude: me.lng, accuracy: me.accuracy, altitude: me.alt });
  if (!('geolocation' in navigator)) return fallbackCenter();
  navigator.geolocation.getCurrentPosition(
    (pos) => { if (editing.acc == null || pos.coords.accuracy <= editing.acc) useFix(pos.coords); },
    () => { if (editing.lat == null) fallbackCenter(); },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
  );
}
function fallbackCenter() {
  const c = map.getCenter();
  Object.assign(editing, { lat: c.lat, lng: c.lng, acc: null, src: 'map' });
  paintWhere();
  $('#note-where').textContent += ' · GPS non disponibile: uso il centro della mappa, poi puoi spostarla.';
}
async function addFiles(files) {
  const save = $('#note-save');
  save.disabled = true; save.textContent = 'Preparo le foto…';
  for (const f of files) {
    try { editing.photos.push(await makePhoto(f)); paintPhotos(); } catch { alert('Una foto non è leggibile e non è stata aggiunta.'); }
  }
  save.disabled = false; save.textContent = 'Salva';
}
for (const id of ['#photo-cam', '#photo-pick']) {
  $(id).addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
}
$('#note-cancel').addEventListener('click', () => dlg.close());
$('#note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (editing.lat == null) { alert('Sto ancora cercando la posizione: aspetta qualche secondo.'); return; }
  editing.text = $('#note-text').value.trim();
  if (isNew && !editing.text && !editing.photos.length && !confirm('La nota è vuota (niente testo né foto). Salvo solo il punto?')) return;
  try { await saveLocal(editing); } catch (err) {
    alert('Non sono riuscito a salvare la nota: ' + ((err && err.message) || 'errore') + '.');
    return;
  }
  dlg.close();
  const ph = editing.photos.length ? ` con ${editing.photos.length} foto` : '';
  flash(`${typeOf(editing.type).icon} Nota salvata${ph}. ${navigator.onLine ? 'La carico sul sito…' : 'La carico sul sito appena torna la rete.'}`, 3500);
});
$('#note-delete').addEventListener('click', async () => {
  if (!confirm('Eliminare questa nota e le sue foto, anche dal sito? Non si può annullare.')) return;
  const n = { id: editing.id, deleted: true, dirty: true, updated: Date.now() };
  await db.put(n);
  local = local.filter((x) => x.id !== n.id).concat(n);
  merge();
  dlg.close();
  scheduleSync();
});

$('#btn-note').addEventListener('click', () => openForm(null));
map.on('contextmenu', (e) => { if (canEdit()) openForm(null, e.latlng); });

// ---------- visualizzatore foto ----------
const viewer = $('#viewer');
function openViewer(src) { viewer.querySelector('img').src = src; viewer.hidden = false; }
viewer.addEventListener('click', () => { viewer.hidden = true; });

// ---------- schede Sentieri / Note ----------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
  $('#list').hidden = b.dataset.tab !== 'list';
  $('#rides').hidden = b.dataset.tab !== 'rides';
  $('#notes').hidden = b.dataset.tab !== 'notes';
  if (b.dataset.tab === 'notes') renderNotes();
}));

// ---------- caricamento sul sito (GitHub) ----------
let syncing = false, syncError = '', syncTimer = null, lastSync = null;
const pendingCount = () => local.filter((n) => n.dirty).length;

function renderSync() {
  const box = $('#sync-box');
  $('#btn-note').hidden = !canEdit();
  if (!canEdit()) {
    box.innerHTML = '<div class="msg">Le note dei sopralluoghi sono visibili a tutti. Per aggiungerne serve collegare l\'account GitHub del sito.</div><button class="btn" id="gh-open">Collega GitHub</button>';
    box.querySelector('#gh-open').addEventListener('click', openGh);
    return;
  }
  const pend = pendingCount();
  let msg;
  if (syncing) msg = '⏳ Carico le note sul sito…';
  else if (syncError) msg = `⚠️ ${esc(syncError)}`;
  else if (pend) msg = `<b>${pend}</b> ${pend === 1 ? 'nota da caricare' : 'note da caricare'}${navigator.onLine ? '' : ': le carico appena torna la rete'}.`;
  else msg = `✅ Tutte le note sono sul sito${lastSync ? ' (ultimo caricamento ' + new Date(lastSync).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ')' : ''}.`;
  box.innerHTML = `<div class="msg">${msg}</div><button class="btn" id="sync-now">Carica ora</button><button class="btn" id="gh-off">Scollega</button>`;
  box.querySelector('#sync-now').addEventListener('click', () => sync(true));
  box.querySelector('#gh-off').addEventListener('click', () => {
    if (pendingCount() && !confirm('Ci sono note non ancora caricate: restano sul telefono, ma non arriveranno sul sito finché non ricolleghi. Scollegare?')) return;
    if (!pendingCount() && !confirm('Scollegare GitHub da questo telefono? Le note restano sul sito.')) return;
    token.set(''); merge();
  });
}

function scheduleSync(ms = 800) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync(false), ms);
}

const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
const utf8b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const b64utf8 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

// Legge notes.json direttamente dal repository (più aggiornato del sito pubblicato).
async function fetchRemoteFromGitHub(ref) {
  try {
    const f = await gh(`/repos/${REPO}/contents/${NOTES_PATH}?ref=${ref}`);
    return { list: JSON.parse(b64utf8(f.content)).notes || [] };
  } catch (e) { if (e.status === 404) return { list: [] }; throw e; }
}

// Un solo commit per volta: foto nuove + notes.json aggiornato + foto da togliere.
async function sync(manual) {
  if (syncing || !canEdit()) return;
  if (!pendingCount()) { if (manual) await refreshRemote(true); return; }
  if (!navigator.onLine) { renderSync(); return; }
  syncing = true; syncError = ''; renderSync();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await pushOnce(); break; } catch (e) { if (attempt === 0 && (e.status === 409 || e.status === 422)) continue; throw e; }
    }
    lastSync = Date.now();
  } catch (e) {
    syncError = e.status === 401 ? 'La chiave GitHub non è valida o è scaduta: scollega e ricollega.'
      : e.status === 403 || e.status === 404 ? 'La chiave GitHub non ha il permesso di scrivere sul repository sentieri-monte-nero.'
      : !navigator.onLine ? 'Rete assente: riprovo appena torna.'
      : 'Caricamento non riuscito, riprovo più tardi.';
    if (manual) alert(syncError);
  } finally {
    syncing = false; merge();
  }
}

async function pushOnce() {
  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const head = await gh(`/repos/${REPO}/git/commits/${headSha}`);
  const { list } = await fetchRemoteFromGitHub(headSha);
  const byId = new Map(list.map((n) => [n.id, n]));
  const tree = [];
  const dirty = local.filter((n) => n.dirty);
  const uploaded = new Map(); // id locale -> versione online

  for (const n of dirty) {
    const old = byId.get(n.id);
    const oldPaths = new Set(old ? (old.photos || []).flatMap((p) => [p.path, p.thumb_path]) : []);
    if (n.deleted) {
      byId.delete(n.id);
      for (const path of oldPaths) tree.push({ path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const photos = [];
    for (const p of n.photos || []) {
      if (p.blob instanceof Blob) {
        const path = `${DATA_DIR}/foto/${p.id}.jpg`, thumb_path = `${DATA_DIR}/foto/${p.id}-mini.jpg`;
        const [a, b] = await Promise.all([
          gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: await b64(p.blob), encoding: 'base64' }) }),
          gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: await b64(p.thumb), encoding: 'base64' }) }),
        ]);
        tree.push({ path, mode: '100644', type: 'blob', sha: a.sha }, { path: thumb_path, mode: '100644', type: 'blob', sha: b.sha });
        photos.push({ id: p.id, taken: p.taken, path, thumb_path });
      } else {
        photos.push({ id: p.id, taken: p.taken, path: p.path, thumb_path: p.thumb_path });
        oldPaths.delete(p.path); oldPaths.delete(p.thumb_path);
      }
    }
    for (const p of photos) { oldPaths.delete(p.path); oldPaths.delete(p.thumb_path); }
    for (const path of oldPaths) if (path) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    const pub = { id: n.id, type: n.type, text: n.text || '', lat: +Number(n.lat).toFixed(6), lng: +Number(n.lng).toFixed(6),
      acc: n.acc != null ? Math.round(n.acc) : null, alt: n.alt != null ? Math.round(n.alt) : null, created: n.created, updated: n.updated, photos };
    byId.set(n.id, pub);
    uploaded.set(n.id, pub);
  }

  const all = [...byId.values()].sort((a, b) => a.created - b.created);
  const json = JSON.stringify({ updated: Date.now(), notes: all }, null, 1);
  const nb = await gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: utf8b64(json), encoding: 'base64' }) });
  tree.push({ path: NOTES_PATH, mode: '100644', type: 'blob', sha: nb.sha });

  const newTree = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const added = dirty.filter((n) => !n.deleted).length, removed = dirty.length - added;
  const what = [added && `${added} ${added === 1 ? 'nota' : 'note'}`, removed && `${removed} ${removed === 1 ? 'nota eliminata' : 'note eliminate'}`].filter(Boolean).join(', ');
  const commit = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `Sopralluoghi: ${what}`, tree: newTree.sha, parents: [headSha] }) });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });

  // Caricate: sul telefono tengo una copia leggera (le foto ora sono sul sito).
  remote = all;
  for (const n of dirty) {
    if (n.deleted) { await db.del(n.id); local = local.filter((x) => x.id !== n.id); continue; }
    // Il sito pubblicato si aggiorna dopo circa un minuto: intanto tengo le foto anche sul telefono.
    const pub = uploaded.get(n.id);
    const keep = {
      ...pub, dirty: false,
      photos: pub.photos.map((pp, i) => {
        const p = n.photos[i] || {};
        return { ...pp, blob: p.blob instanceof Blob ? p.blob : undefined, thumb: p.thumb instanceof Blob ? p.thumb : undefined };
      }),
    };
    await db.put(keep);
    local = local.map((x) => (x.id === n.id ? keep : x));
  }
}

async function refreshRemote(fromApi) {
  try {
    if (fromApi && canEdit() && navigator.onLine) {
      remote = (await fetchRemoteFromGitHub(BRANCH)).list;
    } else {
      const r = await fetch(NOTES_PATH, { cache: 'no-cache' });
      remote = r.ok ? ((await r.json()).notes || []) : [];
      // Il sito pubblicato ha già queste note: tolgo le copie locali (e le foto) dal telefono.
      for (const l of [...local]) {
        const r2 = remote.find((x) => x.id === l.id);
        if (!l.dirty && r2 && (r2.updated || 0) >= (l.updated || 0)) {
          await db.del(l.id).catch(() => {});
          local = local.filter((x) => x.id !== l.id);
        }
      }
    }
  } catch { /* offline: tengo quello che ho */ }
  merge();
}

// ---------- collegamento GitHub ----------
const ghDlg = $('#gh-dlg');
function openGh() { $('#gh-token').value = ''; $('#gh-msg').textContent = ''; ghDlg.showModal(); }
$('#gh-cancel').addEventListener('click', () => ghDlg.close());
$('#gh-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#gh-token').value.trim();
  if (!v) return;
  const msg = $('#gh-msg');
  msg.textContent = 'Controllo la chiave…';
  const prev = token.get();
  token.set(v);
  try {
    const repo = await gh(`/repos/${REPO}`);
    if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error(), { status: 403 });
    ghDlg.close();
    flash('✅ GitHub collegato: ora puoi aggiungere note e foto.', 3500);
    merge();
    refreshRemote(true);
    scheduleSync(200);
  } catch (err) {
    token.set(prev);
    msg.textContent = err.status === 401 ? '❌ Chiave non valida.' : err.status === 403 || err.status === 404
      ? '❌ La chiave non può scrivere su sentieri-monte-nero: controlla "Repository access" e "Contents: Read and write".'
      : '❌ Non riesco a raggiungere GitHub. Sei connesso?';
  }
});

// ---------- esporta punti GPX ----------
$('#btn-gpx').addEventListener('click', async () => {
  if (!notes.length) { alert('Non ci sono ancora note da esportare.'); return; }
  const wpt = notes.map((n) => {
    const t = typeOf(n.type);
    return `<wpt lat="${n.lat}" lon="${n.lng}">${n.alt != null ? `<ele>${n.alt}</ele>` : ''}<time>${new Date(n.created).toISOString()}</time>` +
      `<name>${esc(t.label + (n.text ? ': ' + n.text.split('\n')[0].slice(0, 40) : ''))}</name><desc>${esc(n.text || '')}</desc><type>${t.label}</type></wpt>`;
  }).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sentieri Monte Nero" xmlns="http://www.topografix.com/GPX/1/1">\n${wpt}\n</gpx>\n`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const name = `note-monte-nero-${new Date().toISOString().slice(0, 10)}.gpx`;
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
});

// ---------- avvio ----------
window.addEventListener('online', () => scheduleSync(500));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(1000); });
(async () => {
  try { local = (await db.all()) || []; } catch { local = []; }
  merge();
  await refreshRemote(false);
  if (canEdit()) { scheduleSync(1500); refreshRemote(true); }
})();
