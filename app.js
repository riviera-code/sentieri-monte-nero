'use strict';

// Zona "Monte Nero e dintorni": inquadratura iniziale e area scaricata per l'offline.
const ZONE = L.latLngBounds([43.797, 7.679], [43.862, 7.731]);
const OFFLINE_ZOOMS = [12, 13, 14, 15, 16, 17];
const TILE_CACHE = 'tiles-v1';

const $ = (s) => document.querySelector(s);
const fmtKm = (m) => (m / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
const fmtDist = (m) => (m < 1000 ? Math.round(m) + ' m' : fmtKm(m));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } },
};

// ---------- mappa ----------
const tileOpts = { crossOrigin: true };
const layers = {
  'Topografica': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { ...tileOpts, maxNativeZoom: 17, maxZoom: 19, attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
  'Stradale': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { ...tileOpts, maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
  'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { ...tileOpts, maxZoom: 19, attribution: '© Esri' }),
};
const baseName = ls.get('base', 'Topografica');
const map = L.map('map', { zoomControl: false, layers: [layers[baseName] || layers['Topografica']] });
L.control.layers(layers, null, { position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
map.on('baselayerchange', (e) => ls.set('base', e.name));
map.fitBounds(ZONE);

// ---------- geometria ----------
// Coordinate locali in metri attorno a un punto: abbastanza precise su pochi km.
function projector(lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  return (lat, lng) => [lng * kx, lat * ky];
}
function cumulative(pts) {
  const proj = projector(pts[0][0]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = proj(pts[i - 1][0], pts[i - 1][1]), [bx, by] = proj(pts[i][0], pts[i][1]);
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return cum;
}
// Distanza minima dal punto alla polilinea, con la progressiva lungo la traccia.
function nearestOnTrack(t, lat, lng) {
  const proj = projector(lat);
  const [px, py] = proj(lat, lng);
  let best = { d: Infinity, along: 0 };
  const p = t.pts;
  let [ax, ay] = proj(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) {
    const [bx, by] = proj(p[i][0], p[i][1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(ax + u * dx - px, ay + u * dy - py);
    if (d < best.d) best = { d, along: t.cum[i - 1] + u * (t.cum[i] - t.cum[i - 1]) };
    ax = bx; ay = by;
  }
  return best;
}

// ---------- tracce ----------
let tracks = [];
const hidden = new Set(ls.get('hidden', []));
const group = L.featureGroup().addTo(map);

function popupHtml(t) {
  const el = (t.up != null) ? ` · ↑ ${t.up} m · ↓ ${t.down} m` : '';
  const links = [`<a href="${t.gpx}" download>Scarica GPX</a>`];
  if (t.url) links.push(`<a href="${t.url}" target="_blank" rel="noopener">Apri su komoot</a>`);
  return `<div class="pop"><h4>${t.name}</h4><div class="meta">${fmtKm(t.len)}${el}</div>${links.join('')}</div>`;
}

function drawTrack(t) {
  const g = L.featureGroup();
  const ll = t.pts.map((p) => [p[0], p[1]]);
  L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.85, interactive: false }).addTo(g);
  t.line = L.polyline(ll, { color: t.color, weight: 5 }).addTo(g);
  // linea invisibile più spessa: rende la traccia facile da toccare col dito
  L.polyline(ll, { color: '#000', weight: 22, opacity: 0 }).addTo(g);
  L.circleMarker(ll[0], { radius: 6, color: '#fff', weight: 2, fillColor: t.color, fillOpacity: 1 })
    .bindTooltip(t.name + ' · inizio').addTo(g);
  L.circleMarker(ll[ll.length - 1], { radius: 6, color: t.color, weight: 3, fillColor: '#fff', fillOpacity: 1 })
    .bindTooltip(t.name + ' · fine').addTo(g);
  g.bindPopup(popupHtml(t), { autoPanPaddingTopLeft: [10, 80], autoPanPaddingBottomRight: [70, 80] });
  g.on('popupopen', () => t.line.setStyle({ weight: 8 }));
  g.on('popupclose', () => t.line.setStyle({ weight: 5 }));
  t.group = g;
  if (!hidden.has(t.id)) g.addTo(group);
}

function setHidden(t, hide) {
  if (hide) { hidden.add(t.id); group.removeLayer(t.group); }
  else { hidden.delete(t.id); group.addLayer(t.group); }
  ls.set('hidden', [...hidden]);
  renderList();
}

function focusTrack(t) {
  if (hidden.has(t.id)) setHidden(t, false);
  closeSheet();
  map.fitBounds(t.line.getBounds(), { paddingTopLeft: [20, 80], paddingBottomRight: [70, 90] });
  setTimeout(() => t.group.openPopup(t.line.getCenter()), 300);
}

// ---------- elenco (pannello in basso) ----------
const sheet = $('#sheet');
function openSheet() { sheet.classList.add('open'); $('#sheet-handle').setAttribute('aria-expanded', 'true'); }
function closeSheet() { sheet.classList.remove('open'); $('#sheet-handle').setAttribute('aria-expanded', 'false'); }
$('#sheet-handle').addEventListener('click', () => (sheet.classList.contains('open') ? closeSheet() : openSheet()));
map.on('click', closeSheet);

const eyeOn = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const eyeOff = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10.5 7 10.5 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.4 8.6 1.5 12 1.5 12s4 7 10.5 7a9.6 9.6 0 0 0 4.2-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function renderList() {
  const list = $('#list');
  list.textContent = '';
  const tot = tracks.reduce((s, t) => s + t.len, 0);
  $('#sheet-title').textContent = `Sentieri (${tracks.length}) · ${fmtKm(tot)}`;
  const sorted = [...tracks];
  if (me) sorted.sort((a, b) => a.near.d - b.near.d);
  for (const t of sorted) {
    const row = document.createElement('div');
    row.className = 'row' + (hidden.has(t.id) ? ' off' : '');
    const el = (t.up != null) ? ` · ↑${t.up} ↓${t.down} m` : '';
    const near = me ? ` · <span class="near">${t.near.d < 25 ? 'ci sei sopra' : 'a ' + fmtDist(t.near.d)}</span>` : '';
    row.innerHTML = `<span class="sw" style="background:${t.color}"></span>
      <span class="txt"><div class="name"></div><div class="meta">${fmtKm(t.len)}${el}${near}</div></span>
      <button class="eye" aria-label="${hidden.has(t.id) ? 'Mostra' : 'Nascondi'} ${t.name}">${hidden.has(t.id) ? eyeOff : eyeOn}</button>`;
    row.querySelector('.name').textContent = t.name;
    row.addEventListener('click', () => focusTrack(t));
    row.querySelector('.eye').addEventListener('click', (e) => { e.stopPropagation(); setHidden(t, !hidden.has(t.id)); });
    list.appendChild(row);
  }
}

// ---------- posizione GPS ----------
let me = null, watchId = null, follow = false, meMarker = null, meCircle = null, lastListUpdate = 0;
const btnLocate = $('#btn-locate');
const status = $('#status');

function meIcon(heading) {
  const arrow = (heading != null && !isNaN(heading)) ? `<div class="me-arrow" style="transform:rotate(${heading}deg)"></div>` : '';
  return L.divIcon({ className: '', html: `<div class="me-wrap">${arrow}<div class="me-dot"></div></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
}

function setFollow(on) {
  follow = on;
  btnLocate.classList.toggle('follow', on);
  btnLocate.classList.toggle('on', !on && watchId != null);
}

function stopLocate() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; me = null;
  if (meMarker) { map.removeLayer(meMarker); map.removeLayer(meCircle); meMarker = meCircle = null; }
  status.hidden = true;
  btnLocate.classList.remove('on', 'follow', 'busy');
  follow = false;
  releaseWake();
  renderList();
}

function showStatus(html) { status.innerHTML = html; status.hidden = false; }

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy, altitude, heading, speed } = pos.coords;
  const first = !me;
  me = { lat, lng, accuracy };
  btnLocate.classList.remove('busy');
  const ll = [lat, lng];
  if (!meMarker) {
    meCircle = L.circle(ll, { radius: accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
    meMarker = L.marker(ll, { icon: meIcon(null), interactive: false, zIndexOffset: 1000 }).addTo(map);
  } else {
    meCircle.setLatLng(ll).setRadius(accuracy);
    meMarker.setLatLng(ll);
  }
  meMarker.setIcon(meIcon(speed > 0.5 ? heading : null));

  for (const t of tracks) t.near = nearestOnTrack(t, lat, lng);
  const visible = tracks.filter((t) => !hidden.has(t.id));
  const best = (visible.length ? visible : tracks).reduce((a, b) => (a.near.d <= b.near.d ? a : b));

  const alt = (altitude != null) ? ` · quota ${Math.round(altitude)} m` : '';
  const acc = ` · precisione ±${Math.round(accuracy)} m`;
  const dot = `<span class="dot" style="background:${best.color}"></span>`;
  let line;
  if (best.near.d <= Math.max(25, accuracy)) {
    const done = best.near.along, left = best.len - best.near.along;
    line = `${dot}Sei su <b></b><div class="sub">${fmtDist(done)} dall'inizio · ${fmtDist(left)} alla fine${alt}${acc}</div>`;
  } else {
    line = `${dot}Più vicino: <b></b> a ${fmtDist(best.near.d)}<div class="sub">${alt.slice(3) || 'quota n.d.'}${acc}</div>`;
  }
  showStatus(line);
  status.querySelector('b').textContent = best.name;

  if (first || follow) {
    const z = first ? Math.max(map.getZoom(), 15) : map.getZoom();
    map.setView(ll, z, { animate: !first });
  }
  const now = Date.now();
  if (now - lastListUpdate > 5000) { lastListUpdate = now; renderList(); }
}

function onError(err) {
  btnLocate.classList.remove('busy');
  const msg = {
    1: 'Permesso di posizione negato. Attivalo nelle impostazioni del browser per questo sito.',
    2: 'Posizione non disponibile: controlla che il GPS sia attivo.',
    3: 'Il GPS ci sta mettendo troppo. Riprovo…',
  }[err.code] || 'Errore di posizione.';
  showStatus(msg);
  if (err.code === 1) stopLocate(), showStatus(msg);
}

btnLocate.addEventListener('click', () => {
  if (!('geolocation' in navigator)) { showStatus('Questo browser non supporta la geolocalizzazione.'); return; }
  if (watchId == null) {
    btnLocate.classList.add('busy');
    setFollow(true);
    showStatus('Cerco la posizione…');
    watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    requestWake();
  } else if (!follow) {
    setFollow(true);
    if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15));
  } else {
    stopLocate();
  }
});
// Se sposti la mappa a mano smette di seguirti (il punto blu resta).
map.on('dragstart', () => { if (follow) setFollow(false); });

// Schermo sempre acceso mentre la posizione è attiva (dove supportato).
let wake = null;
async function requestWake() {
  try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch { wake = null; }
}
function releaseWake() { try { wake && wake.release(); } catch { /* già rilasciato */ } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && watchId != null) requestWake(); });

$('#btn-home').addEventListener('click', () => map.fitBounds(ZONE));

// ---------- mappa offline ----------
function tileList(bounds, zooms) {
  const out = [];
  for (const z of zooms) {
    const n = 2 ** z;
    const x0 = Math.floor((bounds.getWest() + 180) / 360 * n), x1 = Math.floor((bounds.getEast() + 180) / 360 * n);
    const yOf = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    const y0 = yOf(bounds.getNorth()), y1 = yOf(bounds.getSouth());
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}
// Stessa chiave usata dal service worker: senza sottodominio a/b/c.
const tileKey = (url) => url.replace(/\/\/[a-c]\.tile\./, '//tile.');

const btnOff = $('#btn-offline');
let downloading = false;
btnOff.addEventListener('click', async () => {
  if (downloading) return;
  if (!('caches' in window)) { showStatus('Questo browser non permette di salvare la mappa offline.'); return; }
  const list = tileList(ZONE, OFFLINE_ZOOMS);
  const cache = await caches.open(TILE_CACHE);
  const url = (t) => `https://${'abc'[Math.abs(t.x + t.y) % 3]}.tile.opentopomap.org/${t.z}/${t.x}/${t.y}.png`;
  let missing = [];
  for (const t of list) if (!(await cache.match(tileKey(url(t))))) missing.push(t);
  if (!missing.length) { showStatus('La mappa topografica di Monte Nero e dintorni è già salvata: funziona anche senza rete.'); setTimeout(() => { if (watchId == null) status.hidden = true; }, 4000); return; }
  const mb = Math.round(missing.length * 0.035);
  if (!confirm(`Salvo sul telefono la mappa topografica di Monte Nero e dintorni (${missing.length} riquadri, circa ${mb} MB), così funziona anche senza segnale. Conviene farlo col Wi-Fi. Procedo?`)) return;
  downloading = true; btnOff.classList.add('busy');
  let done = 0, failed = 0;
  const worker = async () => {
    while (missing.length) {
      const t = missing.shift();
      try {
        const r = await fetch(url(t), { mode: 'cors' });
        if (r.ok) await cache.put(tileKey(url(t)), r); else failed++;
      } catch { failed++; }
      done++;
      if (done % 10 === 0 || !missing.length) showStatus(`Salvo la mappa offline… ${done} riquadri`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  downloading = false; btnOff.classList.remove('busy');
  showStatus(failed ? `Mappa offline salvata, ma ${failed} riquadri non sono arrivati: riprova più tardi.` : 'Mappa offline salvata: Monte Nero e dintorni ora funziona anche senza segnale.');
  setTimeout(() => { if (watchId == null) status.hidden = true; }, 5000);
});

// ---------- avvio ----------
fetch('tracks.json').then((r) => r.json()).then((data) => {
  tracks = data;
  for (const t of tracks) { t.cum = cumulative(t.pts); drawTrack(t); }
  renderList();
}).catch(() => showStatus('Non riesco a caricare i sentieri. Controlla la connessione e ricarica.'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
